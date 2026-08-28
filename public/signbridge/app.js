(() => {
  'use strict';

  const POSE_KEEP = [0, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
  const FACE_KEEP = [0, 7, 13, 14, 17, 33, 37, 39, 40, 46, 52, 53, 55, 61, 63, 65, 66, 70, 78, 80, 81, 82, 84, 87, 88, 91, 95, 105, 107, 133, 144, 145, 146, 153, 154, 155, 157, 158, 159, 160, 161, 163, 173, 178, 181, 185, 191, 246, 249, 263, 267, 269, 270, 276, 282, 283, 285, 291, 293, 295, 296, 300, 308, 310, 311, 312, 314, 317, 318, 321, 324, 334, 336, 362, 373, 374, 375, 380, 381, 382, 384, 385, 386, 387, 388, 390, 398, 402, 405, 409, 415, 466];
  const WINDOW_SECONDS = 2.2;
  const INPUT_FRAMES = 48;
  const INPUT_WIDTH = 357;
  const MIN_SEQUENCE = 12;

  const ui = {
    camera: document.querySelector('#camera'),
    overlay: document.querySelector('#overlay'),
    card: document.querySelector('.camera-card'),
    start: document.querySelector('#start-button'),
    stop: document.querySelector('#stop-button'),
    clear: document.querySelector('#clear-button'),
    statusDot: document.querySelector('#status-dot'),
    statusText: document.querySelector('#status-text'),
    fps: document.querySelector('#fps'),
    prediction: document.querySelector('#prediction'),
    confidence: document.querySelector('#confidence'),
    confidenceBar: document.querySelector('#confidence-bar'),
    topThree: document.querySelector('#top-three'),
    history: document.querySelector('#history'),
    cameraHelp: document.querySelector('#camera-help'),
  };

  const state = {
    stream: null,
    holistic: null,
    session: null,
    classes: [],
    running: false,
    processing: false,
    inferencing: false,
    frameBuffer: [],
    speeds: [],
    previousWrists: null,
    candidate: null,
    candidateStreak: 0,
    lastCommit: null,
    lastMovingAt: 0,
    inferenceTick: 0,
    frameCounter: 0,
    fpsStartedAt: 0,
    history: [],
  };

  function setStatus(text, mode = '') {
    ui.statusText.textContent = text;
    ui.statusDot.className = `status-dot${mode ? ` ${mode}` : ''}`;
  }

  function cameraErrorMessage(error) {
    const name = error?.name || '';
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      return '摄像头权限未开启。请在浏览器的站点设置中允许摄像头；若当前在微信、小红书等内置浏览器中，请改用系统 Safari 或 Chrome 打开。';
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return '没有检测到可用摄像头，请确认设备摄像头可用后重试。';
    }
    if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
      return '摄像头可能正被其他应用占用。请关闭相机、视频通话等应用后重试。';
    }
    return error instanceof Error ? error.message : '摄像头启动失败，请刷新页面后重试。';
  }

  async function requestCamera() {
    const preferred = { video: { facingMode: { ideal: 'user' }, width: { ideal: 960 }, height: { ideal: 720 } }, audio: false };
    try {
      return await navigator.mediaDevices.getUserMedia(preferred);
    } catch (error) {
      if (!['OverconstrainedError', 'TypeError'].includes(error?.name)) throw error;
      return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }
  }

  function landmarkArray(source, indexes) {
    return indexes.map((index) => {
      const point = source?.[index];
      return point ? [point.x || 0, point.y || 0, point.z || 0] : [0, 0, 0];
    });
  }

  function handArray(source) {
    return Array.from({ length: 21 }, (_, index) => {
      const point = source?.[index];
      return point ? [point.x || 0, point.y || 0, point.z || 0] : [0, 0, 0];
    });
  }

  function frameFeature(results) {
    return {
      pose: landmarkArray(results.poseLandmarks, POSE_KEEP),
      face: FACE_KEEP.map((index) => {
        const point = results.faceLandmarks?.[index];
        return point ? [point.x || 0, point.y || 0] : [0, 0];
      }),
      left: handArray(results.leftHandLandmarks),
      right: handArray(results.rightHandLandmarks),
    };
  }

  function hasPoints(frame) {
    return frame.some((point) => point.some((value) => Math.abs(value) > 0));
  }

  function interpolateMissing(sequence, key) {
    const source = sequence.map((item) => item[key]);
    const valid = source.map(hasPoints);
    const validIndexes = valid.flatMap((ok, index) => ok ? [index] : []);
    if (!validIndexes.length) return source;
    if (validIndexes.length === 1) return source.map(() => source[validIndexes[0]].map((point) => [...point]));

    return source.map((frame, frameIndex) => frame.map((point, pointIndex) => point.map((value, channel) => {
      if (valid[frameIndex]) return value;
      let before = validIndexes[0];
      let after = validIndexes[validIndexes.length - 1];
      for (const index of validIndexes) {
        if (index <= frameIndex) before = index;
        if (index >= frameIndex) { after = index; break; }
      }
      if (before === after) return source[before][pointIndex][channel];
      const mix = (frameIndex - before) / (after - before);
      return source[before][pointIndex][channel] * (1 - mix) + source[after][pointIndex][channel] * mix;
    })));
  }

  function normalize(points) {
    const leftShoulder = points[1];
    const rightShoulder = points[2];
    const center = leftShoulder.map((value, index) => (value + rightShoulder[index]) / 2);
    const scale = Math.sqrt(rightShoulder.reduce((sum, value, index) => sum + (value - leftShoulder[index]) ** 2, 0)) + 1e-6;
    return points.map((point) => point.map((value, index) => (value - center[index]) / scale));
  }

  function flatten(frame) {
    return frame.reduce((values, point) => values.concat(point), []);
  }

  function sequenceToFeature(sequence) {
    const poses = interpolateMissing(sequence, 'pose');
    const leftHands = interpolateMissing(sequence, 'left');
    const rightHands = interpolateMissing(sequence, 'right');
    const perFrame = sequence.map((item, index) => {
      const body = normalize([...poses[index], ...leftHands[index], ...rightHands[index]]);
      const face = normalize(item.face.map(([x, y]) => [x, y, 0])).map(([x, y]) => [x, y]);
      return [
        ...flatten(body),
        ...flatten(face),
        hasPoints(leftHands[index]) ? 1 : 0,
        hasPoints(rightHands[index]) ? 1 : 0,
      ];
    });

    const output = new Float32Array(INPUT_FRAMES * INPUT_WIDTH);
    for (let frame = 0; frame < INPUT_FRAMES; frame += 1) {
      const position = frame * (perFrame.length - 1) / (INPUT_FRAMES - 1);
      const low = Math.floor(position);
      const high = Math.min(perFrame.length - 1, Math.ceil(position));
      const mix = position - low;
      for (let feature = 0; feature < INPUT_WIDTH; feature += 1) {
        output[frame * INPUT_WIDTH + feature] = perFrame[low][feature] * (1 - mix) + perFrame[high][feature] * mix;
      }
    }
    return output;
  }

  function softmax(values) {
    const max = Math.max(...values);
    const exponents = values.map((value) => Math.exp(value - max));
    const total = exponents.reduce((sum, value) => sum + value, 0);
    return exponents.map((value) => value / total);
  }

  function rankedPredictions(logits, limit = 3) {
    return softmax(Array.from(logits))
      .map((confidence, index) => ({ word: state.classes[index], confidence }))
      .sort((left, right) => right.confidence - left.confidence)
      .slice(0, limit);
  }

  function showPrediction(predictions) {
    const best = predictions[0];
    if (!best) return;
    ui.prediction.textContent = best.word;
    ui.confidence.textContent = `${Math.round(best.confidence * 100)}%`;
    ui.confidenceBar.style.width = `${Math.min(100, best.confidence * 100)}%`;
    ui.topThree.replaceChildren(...predictions.map((item) => {
      const chip = document.createElement('span');
      chip.textContent = `${item.word} ${Math.round(item.confidence * 100)}%`;
      return chip;
    }));
  }

  function renderHistory() {
    if (!state.history.length) {
      const empty = document.createElement('li');
      empty.className = 'empty';
      empty.textContent = '完成手语动作后，识别结果会出现在这里';
      ui.history.replaceChildren(empty);
      return;
    }
    ui.history.replaceChildren(...state.history.map((item) => {
      const row = document.createElement('li');
      row.textContent = item;
      return row;
    }));
  }

  function commitPrediction(best) {
    if (best.word === state.lastCommit || best.confidence <= 0.35) return;
    state.lastCommit = best.word;
    state.history = [...state.history, best.word].slice(-10);
    renderHistory();
  }

  async function predict() {
    if (state.inferencing || !state.session || state.frameBuffer.length < MIN_SEQUENCE) return;
    state.inferencing = true;
    try {
      const input = sequenceToFeature(state.frameBuffer.map((entry) => entry.feature));
      const tensor = new ort.Tensor('float32', input, [1, INPUT_FRAMES, INPUT_WIDTH]);
      const output = await state.session.run({ [state.session.inputNames[0]]: tensor });
      const predictions = rankedPredictions(output[state.session.outputNames[0]].data);
      showPrediction(predictions);
      const best = predictions[0];
      if (best.word === state.candidate) state.candidateStreak += 1;
      else { state.candidate = best.word; state.candidateStreak = 1; }
      if (state.candidateStreak >= 2) commitPrediction(best);
    } catch (error) {
      console.error('SignBridge inference failed', error);
      setStatus('模型推理失败，请重新启动', 'error');
    } finally {
      state.inferencing = false;
    }
  }

  function wristSpeed(feature) {
    const wrists = feature.pose.slice(5, 7).map((point) => point.slice(0, 2));
    if (!state.previousWrists) { state.previousWrists = wrists; return 0; }
    const speed = wrists.reduce((sum, point, index) => sum + Math.hypot(point[0] - state.previousWrists[index][0], point[1] - state.previousWrists[index][1]), 0) / wrists.length;
    state.previousWrists = wrists;
    state.speeds.push(speed);
    if (state.speeds.length > 5) state.speeds.shift();
    return state.speeds.reduce((sum, value) => sum + value, 0) / state.speeds.length;
  }

  function drawResults(results) {
    const canvas = ui.overlay;
    const width = ui.camera.videoWidth || 640;
    const height = ui.camera.videoHeight || 480;
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, width, height);
    context.save();
    if (results.poseLandmarks) {
      drawConnectors(context, results.poseLandmarks, POSE_CONNECTIONS, { color: '#5cb9ff', lineWidth: 2 });
      drawLandmarks(context, results.poseLandmarks, { color: '#ecf8ff', radius: 2 });
    }
    if (results.leftHandLandmarks) {
      drawConnectors(context, results.leftHandLandmarks, HAND_CONNECTIONS, { color: '#53f2d0', lineWidth: 3 });
      drawLandmarks(context, results.leftHandLandmarks, { color: '#ffffff', radius: 2 });
    }
    if (results.rightHandLandmarks) {
      drawConnectors(context, results.rightHandLandmarks, HAND_CONNECTIONS, { color: '#ff8dd8', lineWidth: 3 });
      drawLandmarks(context, results.rightHandLandmarks, { color: '#ffffff', radius: 2 });
    }
    context.restore();
  }

  function onHolisticResults(results) {
    if (!state.running) return;
    drawResults(results);
    const now = performance.now() / 1000;
    const feature = frameFeature(results);
    const handsVisible = hasPoints(feature.left) || hasPoints(feature.right);
    const moving = wristSpeed(feature) > 0.0025;
    if (moving) state.lastMovingAt = now;
    const idle = now - state.lastMovingAt > 1;

    state.frameBuffer.push({ time: now, feature });
    while (state.frameBuffer.length && now - state.frameBuffer[0].time > WINDOW_SECONDS) state.frameBuffer.shift();

    if (handsVisible && !idle) {
      setStatus('识别中，保持动作完整', 'active');
      state.inferenceTick += 1;
      if (state.inferenceTick % 3 === 0) void predict();
    } else {
      setStatus(handsVisible ? '等待手语动作' : '请让双手进入画面', 'ready');
      state.candidate = null;
      state.candidateStreak = 0;
      if (!handsVisible) state.lastCommit = null;
    }

    state.frameCounter += 1;
    if (state.frameCounter % 20 === 0) {
      const elapsed = performance.now() - state.fpsStartedAt;
      ui.fps.textContent = `${Math.round(20_000 / Math.max(1, elapsed))} FPS`;
      state.fpsStartedAt = performance.now();
    }
  }

  async function loadModel() {
    if (state.session) return;
    setStatus('正在加载 SignFormer 模型…', 'active');
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    ort.env.wasm.wasmPaths = '/signbridge/runtime/';
    const [modelResponse, dataResponse, classesResponse] = await Promise.all([
      fetch('/signbridge/models/signformer.onnx'),
      fetch('/signbridge/models/signformer.onnx.data'),
      fetch('/signbridge/models/classes.json'),
    ]);
    if (!modelResponse.ok || !dataResponse.ok || !classesResponse.ok) throw new Error('模型文件下载失败');
    const [model, data, classes] = await Promise.all([modelResponse.arrayBuffer(), dataResponse.arrayBuffer(), classesResponse.json()]);
    state.classes = classes;
    state.session = await ort.InferenceSession.create(new Uint8Array(model), {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
      externalData: [{ path: 'signformer.onnx.data', data: new Uint8Array(data) }],
    });
  }

  async function createHolistic() {
    if (state.holistic) return;
    setStatus('正在加载手部与姿态检测…', 'active');
    state.holistic = new Holistic({ locateFile: (file) => `/signbridge/vendor/mediapipe/${file}` });
    state.holistic.setOptions({ modelComplexity: 1, smoothLandmarks: true, enableSegmentation: false, refineFaceLandmarks: false, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
    state.holistic.onResults(onHolisticResults);
    await state.holistic.initialize();
  }

  async function processFrames() {
    if (!state.running) return;
    if (!state.processing && ui.camera.readyState >= 2) {
      state.processing = true;
      try { await state.holistic.send({ image: ui.camera }); }
      catch (error) {
        console.error('MediaPipe frame failed', error);
        setStatus('关键点检测暂时失败', 'error');
      } finally { state.processing = false; }
    }
    if (state.running) requestAnimationFrame(processFrames);
  }

  async function start() {
    if (state.running) return;
    ui.start.disabled = true;
    ui.cameraHelp.hidden = true;
    try {
      if (!window.isSecureContext) throw new Error('摄像头需要 HTTPS 安全连接');
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('当前浏览器无法调用摄像头，请使用系统 Safari 或 Chrome 打开本页');
      setStatus('正在请求摄像头权限…', 'active');
      state.stream = await requestCamera();
      ui.camera.srcObject = state.stream;
      ui.card.classList.add('running');
      await ui.camera.play();
      setStatus('摄像头已开启，正在加载识别模型…', 'active');
      await Promise.all([loadModel(), createHolistic()]);
      state.running = true;
      state.frameBuffer = [];
      state.previousWrists = null;
      state.lastMovingAt = performance.now() / 1000;
      state.frameCounter = 0;
      state.fpsStartedAt = performance.now();
      ui.start.hidden = true;
      ui.stop.hidden = false;
      setStatus('模型已就绪，请让双手进入画面', 'ready');
      requestAnimationFrame(processFrames);
    } catch (error) {
      console.error('SignBridge start failed', error);
      const message = cameraErrorMessage(error);
      setStatus(message, 'error');
      ui.cameraHelp.textContent = message;
      ui.cameraHelp.hidden = false;
      stop(false);
    } finally {
      ui.start.disabled = false;
    }
  }

  function stop(showStatus = true) {
    state.running = false;
    state.stream?.getTracks().forEach((track) => track.stop());
    state.stream = null;
    ui.camera.srcObject = null;
    ui.overlay.getContext('2d').clearRect(0, 0, ui.overlay.width, ui.overlay.height);
    ui.card.classList.remove('running');
    ui.start.hidden = false;
    ui.stop.hidden = true;
    ui.fps.textContent = '';
    if (showStatus) setStatus('已停止');
  }

  ui.start.addEventListener('click', () => void start());
  ui.stop.addEventListener('click', stop);
  ui.clear.addEventListener('click', () => { state.history = []; renderHistory(); });
  window.addEventListener('pagehide', stop);
})();
