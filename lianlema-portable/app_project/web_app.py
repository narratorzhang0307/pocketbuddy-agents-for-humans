import os
import base64
import time
import hashlib
import subprocess
import shutil
import cv2  # 新增：用于处理图像可视化
import torch
import numpy as np
import imageio_ffmpeg
from flask import Flask, request, render_template, jsonify, send_from_directory, abort
from werkzeug.utils import secure_filename

from src.datapro import PreProcess
from src.fitness_infer import FITNESS_LABELS, load_fitness_action_recognizer
from src.live_coach import (
    EXERCISES as LIVE_EXERCISES,
    GENERIC_EXERCISES,
    SPECIALIZED_EXERCISES,
    LiveCoachEngine,
    LiveCoachSessionStore,
    normalize_exercise,
)
from src.score import Score
from src.model import ST_GCN
from src.local_llm import chat_with_ollama_model

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['RESULT_FOLDER'] = 'static/results'  # 新增：保存可视化图像的目录
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['RESULT_FOLDER'], exist_ok=True)  # 确保目录存在


# ---- CORS 支持（允许 App web 版 / 浏览器跨域调用，手机端无影响）----
@app.after_request
def _add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    return response


@app.route('/api/<path:_any>', methods=['OPTIONS'])
def _cors_preflight(_any):
    # 预检请求直接放行（CORS 头由 after_request 统一添加）。
    return ('', 204)


def _resolve_runtime_dir():
    configured_runtime_dir = os.getenv("POSE_RUNTIME_DIR")
    if configured_runtime_dir:
        return configured_runtime_dir
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), ".pose_runtime")


RUNTIME_DIR = _resolve_runtime_dir()
os.makedirs(RUNTIME_DIR, exist_ok=True)
FFMPEG_DIR = os.path.join(RUNTIME_DIR, "ffmpeg")
app.config['COMPAT_VIDEO_FOLDER'] = os.path.join(RUNTIME_DIR, "compat_videos")
os.makedirs(FFMPEG_DIR, exist_ok=True)
os.makedirs(app.config['COMPAT_VIDEO_FOLDER'], exist_ok=True)

VIDEO_DIR_CANDIDATES = [
    os.getenv("POSE_VIDEO_DIR"),
    r"E:\Program\PoseClassifier\配套视频",
    r"D:\桌面\配套视频",
    r"E:\配套视频",
]
VIDEO_DIR = next(
    (path for path in VIDEO_DIR_CANDIDATES if path and os.path.isdir(path)),
    VIDEO_DIR_CANDIDATES[1],
)
if not os.path.isdir(VIDEO_DIR):
    print(
        f"演示视频目录不存在: {VIDEO_DIR}。"
        "请设置环境变量 POSE_VIDEO_DIR，或把 VIDEO_DIR 改成你自己的路径。"
    )

ACTION_CLASSES = {
    0: "双手托天理三焦", 1: "左右开弓似射雕", 2: "调理脾胃须单举",
    3: "五劳七伤往后瞧", 4: "摇头摆尾去心火", 5: "双手攀足固肾腰",
    6: "攒拳怒目增气力", 7: "背后七颠百病消", 8: "虎戏", 9: "鹿戏",
    10: "熊戏", 11: "猿戏", 12: "鸟戏", 13: "收势", 14: "无法识别/其他"
}

session_histories = {}
model, device = None, None
pose_transformer = None
live_pose_estimator = None
fitness_action_recognizer = None
live_session_store = LiveCoachSessionStore()
live_coach_engine = LiveCoachEngine()


def get_pose_transformer():
    global pose_transformer
    if pose_transformer is None:
        from src.rtmpose_tran import RTM_Pose_Tran

        pose_transformer = RTM_Pose_Tran
    return pose_transformer


def get_live_pose_estimator():
    global live_pose_estimator
    if live_pose_estimator is None:
        from src.rtmpose_tran import body

        live_pose_estimator = body
    return live_pose_estimator


def decode_image_data(image_data):
    if not image_data or "," not in image_data:
        raise ValueError("无效的图像数据")

    _, encoded = image_data.split(",", 1)
    try:
        image_bytes = base64.b64decode(encoded)
    except Exception as exc:
        raise ValueError("图像解码失败") from exc

    frame = cv2.imdecode(np.frombuffer(image_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
    if frame is None:
        raise ValueError("无法读取图像帧")
    return frame


def extract_live_pose(image_data):
    frame = decode_image_data(image_data)
    keypoints, _ = get_live_pose_estimator()(frame)
    if len(keypoints) == 0:
        return None
    return np.asarray(keypoints[0], dtype=np.float32)


def _detect_video_codec_tag(video_path):
    cap = cv2.VideoCapture(video_path)
    try:
        fourcc = int(cap.get(cv2.CAP_PROP_FOURCC))
    finally:
        cap.release()
    return "".join(chr((fourcc >> (8 * i)) & 0xFF) for i in range(4)).strip().lower()


def _compat_video_path(filename):
    digest = hashlib.sha1(filename.encode("utf-8")).hexdigest()[:16]
    return os.path.join(app.config['COMPAT_VIDEO_FOLDER'], f"{digest}.mp4")


def _get_ffmpeg_exe():
    bundled_exe = imageio_ffmpeg.get_ffmpeg_exe()
    runtime_exe = os.path.join(FFMPEG_DIR, os.path.basename(bundled_exe))
    if not os.path.exists(runtime_exe):
        shutil.copy2(bundled_exe, runtime_exe)
        print(f"已将 ffmpeg 复制到: {runtime_exe}")
    return runtime_exe


def _ensure_browser_compatible_video(filename):
    source_path = os.path.join(VIDEO_DIR, filename)
    if not os.path.isfile(source_path):
        abort(404, description=f"演示视频不存在: {source_path}")

    codec_tag = _detect_video_codec_tag(source_path)
    if codec_tag != "hevc":
        return source_path

    compat_path = _compat_video_path(filename)
    if os.path.exists(compat_path) and os.path.getmtime(compat_path) >= os.path.getmtime(source_path):
        return compat_path

    ffmpeg_exe = _get_ffmpeg_exe()
    tmp_path = compat_path + ".tmp.mp4"
    cmd = [
        ffmpeg_exe,
        "-y",
        "-i",
        source_path,
        "-map",
        "0:v:0",
        "-map",
        "0:a?",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-f",
        "mp4",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        tmp_path,
    ]
    print(f"检测到 HEVC 视频，开始转码供浏览器播放: {filename}")
    result = subprocess.run(cmd, capture_output=True)
    stderr_text = result.stderr.decode("utf-8", errors="replace") if result.stderr else ""
    if result.returncode != 0:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise RuntimeError(
            "视频转码失败: " + "\n".join(stderr_text.splitlines()[-8:])
        )
    os.replace(tmp_path, compat_path)
    print(f"转码完成: {compat_path}")
    return compat_path


def load_global_model():
    global model, device, fitness_action_recognizer
    if model is None:
        model_path = r"model/best_model_7_exchange_val_and_test.pth"
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        print(f"使用 {device} 加载模型")

        # 当前仓库里的这份权重实际是 15 分类。
        model = ST_GCN(num_classes=15, in_channels=2, t_kernel_size=9, hop_size=1)
        print(f"准备加载模型权重: {model_path}")
        model.load_state_dict(torch.load(model_path, map_location=device))
        print("加载模型权重成功")
        model.to(device)
        model.eval()

    if fitness_action_recognizer is None:
        checkpoint_path = os.getenv(
            "FITNESS_RECOGNIZER_PATH",
            os.path.join("model", "mmfit_pose11cls_stride48_best.pth"),
        )
        fitness_action_recognizer = load_fitness_action_recognizer(
            checkpoint_path,
            device=device,
            window_size=48,
            min_confidence=0.35,
            num_classes=len(FITNESS_LABELS),
        )
        if fitness_action_recognizer is None:
            print(f"未找到 MM-Fit 健身识别权重: {checkpoint_path}")
        else:
            print(f"已加载 MM-Fit 健身识别权重: {checkpoint_path}")


load_global_model()


# --- 辅助逻辑函数 ---

def estimate_heart_rate(keypoints):
    if keypoints is None or len(keypoints) < 2: return None
    total_movement = 0
    num_points = keypoints.shape[1]
    for i in range(1, len(keypoints)):
        frame_diff = np.abs(keypoints[i] - keypoints[i - 1])
        total_movement += np.sum(frame_diff)
    avg_movement = total_movement / (len(keypoints) * num_points)
    base_hr = 70
    movement_factor = min(avg_movement * 500, 50)
    return max(60, int(min(base_hr + movement_factor, 180)))


def extract_section(text, start_marker, end_marker=None):
    try:
        start = text.find(start_marker)
        if start == -1: return ""
        start += len(start_marker)
        end = text.find(end_marker, start) if end_marker else len(text)
        if end == -1: end = len(text)
        return text[start:end].strip().replace("*", "")
    except:
        return ""


def generate_feedback(action_id, score, heart_rate=None):
    import re

    hr_info = f"心率: {heart_rate} BPM" if heart_rate else "心率: 未检测"
    prompt = f"""你是一位专业的健身教练和中医养生专家，请用中文回答。
动作名称: {ACTION_CLASSES.get(action_id, '未知')}
动作评分: {score:.2f} (满分1.00)
{hr_info}

请严格按下面格式输出，每个标签单独一行，标签后直接跟内容，不要有多余说明：
[动作评价] 对该动作完成情况的整体评价
[评分分析] 对评分高低的具体分析
[心率评估] 对当前心率的评估
[改进建议] 具体的改进建议
[鼓励话语] 一句鼓励的话"""
    try:
        response = chat_with_ollama_model([{'role': 'user', 'content': prompt}])
        full_text = response['message']['content']
        print(f"[DEBUG] ollama raw: {full_text[:200]}")

        clean_text = re.sub(r'<think>[\s\S]*?</think>', '', full_text).strip()

        def extract(text, tag):
            pattern = rf'\[{re.escape(tag)}\]\s*(.*?)(?=\[[\u4e00-\u9fa5a-zA-Z]+\]|$)'
            m = re.search(pattern, text, re.DOTALL)
            return m.group(1).strip().replace('*', '') if m else ''

        return {
            'raw': clean_text,
            'evaluation': extract(clean_text, '动作评价'),
            'analysis': extract(clean_text, '评分分析'),
            'hr_eval': extract(clean_text, '心率评估'),
            'suggestion': extract(clean_text, '改进建议'),
            'encouragement': extract(clean_text, '鼓励话语'),
        }
    except Exception as e:
        print(f"[ERROR] generate_feedback failed: {e}")
        return {
            'raw': str(e),
            'evaluation': f"Gemma 反馈未就绪: {e}",
            'analysis': '',
            'hr_eval': '',
            'suggestion': '',
            'encouragement': '',
        }


def create_visualization(video_path, keypoints, filename):
    """新增：截取中间帧并画出骨骼连线，用于前端显示"""
    try:
        cap = cv2.VideoCapture(video_path)
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) // 2)
        ret, frame = cap.read()
        cap.release()

        if ret and keypoints is not None:
            # 取中间帧的骨骼点
            kp_frame = keypoints[len(keypoints) // 2]
            # 简单的连线逻辑 (基于COCO 17点)
            skeleton = [(5, 7), (7, 9), (6, 8), (8, 10), (11, 13), (13, 15), (12, 14), (14, 16), (5, 6), (11, 12),
                        (5, 11), (6, 12)]
            for p1, p2 in skeleton:
                pt1 = (int(kp_frame[p1][0]), int(kp_frame[p1][1]))
                pt2 = (int(kp_frame[p2][0]), int(kp_frame[p2][1]))
                cv2.line(frame, pt1, pt2, (0, 255, 0), 2)
                cv2.circle(frame, pt1, 4, (0, 0, 255), -1)
                cv2.circle(frame, pt2, 4, (0, 0, 255), -1)

            out_filename = f"vis_{int(time.time())}.jpg"
            out_path = os.path.join(app.config['RESULT_FOLDER'], out_filename)
            cv2.imwrite(out_path, frame)
            return f"/{app.config['RESULT_FOLDER']}/{out_filename}"
    except Exception as e:
        print(f"Visualization error: {e}")
    return ""


def resolve_live_exercise(exercise):
    try:
        return normalize_exercise(exercise)
    except ValueError:
        return "other"


def resolve_coaching_mode(exercise):
    if exercise in SPECIALIZED_EXERCISES:
        return "specialized"
    if exercise in GENERIC_EXERCISES and exercise != "other":
        return "generic"
    return "fallback"


def process_video_file(filepath, filename):
    start_time = time.time()
    good_vid, keypoints = get_pose_transformer()(filepath, display_pose=False)

    if not good_vid:
        raise ValueError("无法提取骨骼关键点")

    pp_keypoints = PreProcess(keypoints)
    action, conf = model.predict(pp_keypoints)
    action_id = int(action[0][0])
    conf_val = float(conf[0][0])
    print(f"[DEBUG] action={action_id}, conf={conf_val:.4f}")
    score = Score(keypoints, action_id, conf_val)
    print(f"[DEBUG] score={score:.4f}")

    if action_id == 14 or (score < 0.3 and conf_val < 0.3):
        action_id = 14
        score = 0.0

    heart_rate = estimate_heart_rate(keypoints)
    duration = time.time() - start_time
    vis_image_path = create_visualization(filepath, keypoints, filename)
    feedback_data = generate_feedback(action_id, score, heart_rate)

    return {
        'filename': filename,
        'action_id': action_id,
        'action_name': ACTION_CLASSES[action_id],
        'score': score,
        'heart_rate': heart_rate,
        'duration': duration,
        'frame_count': keypoints.shape[0],
        'feedback': feedback_data,
        'vis_image': vis_image_path,
    }


# --- 路由 ---

@app.route('/local_videos/<path:filename>')
def serve_video(filename):
    if not os.path.isdir(VIDEO_DIR):
        abort(404, description=f"演示视频目录不存在: {VIDEO_DIR}")
    playable_path = _ensure_browser_compatible_video(filename)
    return send_from_directory(
        os.path.dirname(playable_path),
        os.path.basename(playable_path),
    )

@app.route('/')
def index():
    return render_template('index.html', result=None, error=None, exercises=LIVE_EXERCISES)


@app.route('/upload', methods=['POST'])
def upload_file():
    if 'video' not in request.files: return render_template('index.html', result=None, error="未选择文件", exercises=LIVE_EXERCISES)
    file = request.files['video']
    if file.filename == '': return render_template('index.html', result=None, error="文件名为空", exercises=LIVE_EXERCISES)

    filename = secure_filename(file.filename)
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(filepath)

    try:
        result_data = process_video_file(filepath, filename)
        return render_template('index.html', result=result_data, exercises=LIVE_EXERCISES)
    except Exception as e:
        return render_template('index.html', result=None, error=f"处理发生错误: {str(e)}", exercises=LIVE_EXERCISES)
    finally:
        try:
            os.remove(filepath)
        except OSError:
            pass


@app.route('/webcam-upload', methods=['POST'])
def webcam_upload():
    if 'video' not in request.files: return render_template('index.html', result=None, error="未选择文件", exercises=LIVE_EXERCISES)
    file = request.files['video']
    if file.filename == '': return render_template('index.html', result=None, error="文件名为空", exercises=LIVE_EXERCISES)

    filename = secure_filename(file.filename)
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(filepath)

    try:
        result_data = process_video_file(filepath, filename)
        return render_template('index.html', result=result_data, exercises=LIVE_EXERCISES)
    except Exception as e:
        return render_template('index.html', result=None, error=f"处理发生错误: {str(e)}", exercises=LIVE_EXERCISES)
    finally:
        try:
            os.remove(filepath)
        except OSError:
            pass


@app.route('/api/session/start', methods=['POST'])
def api_session_start():
    payload = request.get_json(silent=True) or {}
    exercise = str(payload.get('exercise', '')).strip()
    mode = str(payload.get('mode', 'manual')).strip().lower() or 'manual'

    try:
        session = live_session_store.start(exercise)
    except ValueError as exc:
        return jsonify({
            'error': str(exc),
            'supported_exercises': list(LIVE_EXERCISES),
        }), 400

    if fitness_action_recognizer is not None:
        fitness_action_recognizer.reset()

    return jsonify({
        'session_id': session.session_id,
        'exercise': session.exercise,
        'exercise_label': LIVE_EXERCISES[session.exercise]['label'],
        'tip': LIVE_EXERCISES[session.exercise]['tip'],
        'mode': mode,
    })


@app.route('/api/session/frame', methods=['POST'])
def api_session_frame():
    payload = request.get_json(silent=True) or {}
    session_id = str(payload.get('session_id', '')).strip()
    image_data = payload.get('image_data')
    mode = str(payload.get('mode', 'manual')).strip().lower() or 'manual'

    if not session_id:
        return jsonify({'error': '缺少 session_id'}), 400
    if not image_data:
        return jsonify({'error': '缺少 image_data'}), 400

    try:
        session = live_session_store.get(session_id)
    except KeyError:
        return jsonify({'error': '会话不存在或已过期'}), 404

    try:
        keypoints = extract_live_pose(image_data)
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400

    active_exercise = session.exercise
    recognized_action = ""
    recognized_confidence = 0.0
    recognition_state = "manual"

    if mode == "auto":
        if fitness_action_recognizer is None:
            recognition_state = "model_unavailable"
        elif keypoints is None:
            recognition_state = "no_person"
        else:
            recognized = fitness_action_recognizer.push_frame(keypoints)
            if recognized is None:
                recognition_state = "warming_up"
            else:
                recognized_action = resolve_live_exercise(recognized.get("action", "other"))
                recognized_confidence = recognized["confidence"]
                active_exercise = recognized_action
                recognition_state = "recognized"

    result = live_coach_engine.evaluate(active_exercise, keypoints, session)
    coaching_mode = resolve_coaching_mode(active_exercise)
    return jsonify({
        **result,
        'exercise': session.exercise,
        'exercise_label': LIVE_EXERCISES[session.exercise]['label'],
        'active_exercise': active_exercise,
        'active_exercise_label': LIVE_EXERCISES[active_exercise]['label'],
        'coaching_mode': coaching_mode,
        'mode': mode,
        'recognized_action': recognized_action,
        'recognized_confidence': recognized_confidence,
        'recognition_state': recognition_state,
    })


@app.route('/api/session/stop', methods=['POST'])
def api_session_stop():
    payload = request.get_json(silent=True) or {}
    session_id = str(payload.get('session_id', '')).strip()
    if not session_id:
        return jsonify({'error': '缺少 session_id'}), 400

    try:
        session = live_session_store.stop(session_id)
    except KeyError:
        return jsonify({'error': '会话不存在或已过期'}), 404

    if fitness_action_recognizer is not None:
        fitness_action_recognizer.reset()

    summary = live_coach_engine.build_summary(session)
    return jsonify({'summary': summary})


@app.route('/chat', methods=['POST'])
def chat():
    try:
        data = request.get_json()
        user_msg = data.get('message')
        action_id = int(data.get('action'))
        score = float(data.get('score'))

        session_id = request.remote_addr
        if session_id not in session_histories:
            bg_info = f"用户动作：{ACTION_CLASSES.get(action_id)}，评分：{score:.2f}。"
            session_histories[session_id] = [
                {'role': 'system', 'content': f'你是一个健身教练。{bg_info} 请回答用户问题。'}
            ]

        session_histories[session_id].append({'role': 'user', 'content': user_msg})
        response = chat_with_ollama_model(session_histories[session_id])
        reply = response['message']['content']
        session_histories[session_id].append({'role': 'assistant', 'content': reply})

        return jsonify({'reply': reply})
    except Exception as e:
        return jsonify({'reply': f'Gemma 调用失败: {e}'}), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=4000, debug=True)
