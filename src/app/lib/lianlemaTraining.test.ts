import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { consumeFrostTraining, forgetTraining, rememberedTraining, rememberTraining, reportTrainingStage }
  from '../../../lianlema-portable/app_project/app/src/camera/trainingConsent';

function store() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); } };
}
const base = 'https://pocketbuddy.throughtheglass.art/lianlema';
const search = '?embed=frost&frostAutoStart=1&frostRunId=run:1&frostParentOrigin=capacitor%3A%2F%2Flocalhost';
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('remembered training consent and explicit start', () => {
  it('does not invent prior consent; remembers the chosen exercise only for the same endpoint', () => {
    const s = store();
    expect(rememberedTraining(base, s)).toBeUndefined();
    rememberTraining(base, 'lunge', s);
    expect(rememberedTraining(base + '/', s)).toBe('lunge');
    expect(rememberedTraining('https://other.example/lianlema', s)).toBeUndefined();
    expect(rememberedTraining(base + '/other', s)).toBeUndefined();
    forgetTraining(base, s); expect(rememberedTraining(base, s)).toBeUndefined();
  });
  it('asks again when storage is corrupt/unavailable rather than treating errors as permission', () => {
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('full'); }, removeItem: () => {} };
    expect(rememberedTraining(base, broken)).toBeUndefined();
    expect(() => rememberTraining(base, 'squat', broken)).not.toThrow();
    expect(rememberedTraining(base, { ...store(), getItem: () => '{broken' })).toBeUndefined();
    expect(rememberedTraining(base, { ...store(), getItem: () => '{"version":1,"exercise":"unknown"}' })).toBeUndefined();
  });
  it('consumes one real foreground launch and prevents reload/back from repeating it', () => {
    const s = store();
    expect(consumeFrostTraining(search, true, false, s)).toBe(false);
    expect(consumeFrostTraining(search, false, true, s)).toBe(false);
    expect(consumeFrostTraining(search, true, true, s)).toBe(true);
    expect(consumeFrostTraining(search, true, true, s)).toBe(false);
    expect(consumeFrostTraining(search.replace('run:1', 'run:2'), true, true, s)).toBe(true);
  });
  it('does not auto-start from a normal menu, missing run or untrusted parent', () => {
    for (const query of ['', '?embed=frost', search.replace('frostAutoStart=1', 'frostAutoStart=0'),
      search.replace('run:1', ''), search.replace('capacitor%3A%2F%2Flocalhost', 'https%3A%2F%2Fevil.example')]) {
      expect(consumeFrostTraining(query, true, true, store())).toBe(false);
    }
    expect(consumeFrostTraining(search, true, true, undefined)).toBe(false);
  });
  it('reports only stage metadata to the configured host, not images or recognized text', () => {
    const postMessage = vi.fn();
    vi.stubGlobal('window', { parent: { postMessage }, location: { search } });
    reportTrainingStage('camera-ready');
    expect(postMessage).toHaveBeenCalledExactlyOnceWith({ protocol: 'pocket-lianlema/v1', type: 'camera-ready', runId: 'run:1' }, '*');
    vi.stubGlobal('window', { parent: { postMessage }, location: { search: '?embed=frost&frostParentOrigin=https://evil.example' } });
    reportTrainingStage('frame-analyzed'); expect(postMessage).toHaveBeenCalledTimes(1);
  });
});

// Exercise the actual screen's lifecycle with fake hooks, camera, model and audio.
// No real camera, network, native API or paid service is invoked by this harness.
function trainingScreen(remembered: boolean) {
  let cursor = 0;
  const hooks: any[] = [], effects: Array<() => void> = [];
  const same = (a: unknown[] | undefined, b: unknown[] | undefined) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const useState = (initial: any) => {
    const i = cursor++;
    if (!(i in hooks)) hooks[i] = typeof initial === 'function' ? initial() : initial;
    return [hooks[i], (next: any) => { hooks[i] = typeof next === 'function' ? next(hooks[i]) : next; }];
  };
  const react = { useState, useRef: (value: any) => useState(() => ({ current: value }))[0],
    useCallback: (fn: any, deps: unknown[]) => { const i = cursor++; if (!same(hooks[i]?.deps, deps)) hooks[i] = { deps, fn }; return hooks[i].fn; },
    useEffect: (fn: () => any, deps: unknown[]) => {
      const i = cursor++, previous = hooks[i];
      if (!same(previous?.deps, deps)) {
        hooks[i] = { deps };
        effects.push(() => { previous?.cleanup?.(); hooks[i].cleanup = fn(); });
      }
    } };
  let permission = { status: 'granted', granted: true, canAskAgain: true };
  let appState = (_state: string) => {};
  const requestPermission = vi.fn(async () => permission);
  const analyze = vi.fn(async () => ({ repCount: 1, isStandard: true, status: 'conclusive' }));
  const audio = { playIntro: vi.fn(async () => {}), playGenericFeedback: vi.fn(), playSquatFeedback: vi.fn(), stopCoachAudio: vi.fn(async () => {}) };
  const stopFormSession = vi.fn(async () => {}), forgetTraining = vi.fn(), reportTrainingStage = vi.fn();
  const navigation = { goBack: vi.fn(), replace: vi.fn() };
  const source = readFileSync(new URL('../../../lianlema-portable/app_project/app/src/screens/TrainingScreen.tsx', import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports: { default?: (props: any) => any } = {};
  const element = (type: any, props: any) => ({ type, props });
  runInNewContext(output, { exports, setInterval, clearInterval, Date,
    document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} },
    URL,
    require: (name: string) => {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx: element, jsxs: element };
      if (name === 'react-native') return { Platform: { OS: 'web' }, Animated: { Value: class {}, View: 'AnimatedView', timing: () => ({}), sequence: () => ({}), loop: () => ({ start() {}, stop() {} }) },
        AppState: { addEventListener: (_: string, listener: typeof appState) => { appState = listener; return { remove() {} }; } },
        StyleSheet: { create: (s: any) => s, absoluteFill: {}, absoluteFillObject: {} }, Pressable: 'Pressable', Text: 'Text', View: 'View' };
      if (name === 'expo-camera') return { CameraView: 'CameraView', useCameraPermissions: () => [permission, requestPermission] };
      if (name === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView' };
      if (name === 'expo-linear-gradient') return { LinearGradient: 'LinearGradient' };
      if (name === 'expo-blur') return { BlurView: 'BlurView' };
      if (name === '../analysis') return { getFormProvider: () => ({ analyze }), stopFormSession, modelBaseUrl: () => base };
      if (name === '../camera/analysisFrame') return { analysisFrame: async (value: string) => value };
      if (name === '../camera/trainingConsent') return { rememberedTraining: () => remembered ? 'lunge' : undefined, rememberTraining: vi.fn(), forgetTraining, reportTrainingStage };
      if (name === '../voice/coachAudio') return audio;
      if (name === '../ui/haptics') return { heavyHaptic() {}, lightHaptic() {} };
      if (name === '../ui/theme') return { colors: {}, font: {}, radius: {}, spacing: (n: number) => n, elevation: () => ({}), toneOf: () => ({ color: 'green', label: 'ok' }) };
      if (name === '../types') return { EXERCISE_LABEL: { lunge: '弓步蹲' } };
      throw new Error('Unexpected module: ' + name);
    },
  });
  const render = () => { cursor = 0; const tree = exports.default!({ navigation, route: { params: { exercise: 'lunge' } } });
    for (const fn of effects.splice(0)) fn(); return tree; };
  const camera = (tree: any): any => {
    if (!tree || typeof tree !== 'object') return;
    if (tree.type === 'CameraView') return tree;
    for (const child of [tree.props?.children].flat(Infinity)) { const found = camera(child); if (found) return found; }
  };
  return { render, camera, analyze, audio, stopFormSession, forgetTraining, reportTrainingStage, requestPermission,
    navigation,
    appState: (state: string) => appState(state), revoke: () => { permission = { status: 'denied', granted: false, canAskAgain: false }; } };
}

describe('training camera lifecycle', () => {
  it('can switch to a video without granting or opening the camera', () => {
    const s = trainingScreen(false), tree = s.render();
    const findSwitch = (node: any): any => {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'Pressable' && node.props.children?.props?.children === '不使用摄像头 · 改用预录视频') return node;
      for (const child of [node.props?.children].flat(Infinity)) { const found = findSwitch(child); if (found) return found; }
    };
    findSwitch(tree).props.onPress();
    expect(s.navigation.replace).toHaveBeenCalledWith('VideoAnalysis', { exercise: 'lunge' });
    expect(s.requestPermission).not.toHaveBeenCalled(); expect(s.analyze).not.toHaveBeenCalled();
    expect(s.stopFormSession).toHaveBeenCalled(); expect(s.audio.stopCoachAudio).toHaveBeenCalled();
  });
  it('still requires the first analysis consent even when OS camera permission was granted elsewhere', async () => {
    const s = trainingScreen(false); s.render(); await Promise.resolve();
    expect(s.camera(s.render())).toBeUndefined();
    expect(s.audio.playIntro).not.toHaveBeenCalled(); expect(s.requestPermission).not.toHaveBeenCalled();
  });
  it('starts from remembered consent, stops in background, and does not restart on foreground', async () => {
    vi.useFakeTimers(); const s = trainingScreen(true);
    s.render(); await vi.advanceTimersByTimeAsync(0);
    const camera = s.camera(s.render()); expect(camera).toBeTruthy();
    camera.props.ref.current = { takePictureAsync: async () => ({ base64: 'test-frame' }) };
    camera.props.onCameraReady(); await vi.advanceTimersByTimeAsync(700);
    expect(s.analyze).toHaveBeenCalledOnce(); expect(s.reportTrainingStage).toHaveBeenCalledWith('frame-analyzed');
    s.appState('background'); expect(s.camera(s.render())).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1400); expect(s.analyze).toHaveBeenCalledTimes(1);
    s.appState('active'); expect(s.camera(s.render())).toBeUndefined();
    expect(s.stopFormSession).toHaveBeenCalled(); expect(s.audio.stopCoachAudio).toHaveBeenCalled();
  });
  it('revoked OS camera permission stops training and clears remembered consent', async () => {
    vi.useFakeTimers(); const s = trainingScreen(true); s.render(); await vi.advanceTimersByTimeAsync(0);
    expect(s.camera(s.render())).toBeTruthy();
    s.revoke(); s.render(); expect(s.camera(s.render())).toBeUndefined();
    expect(s.forgetTraining).toHaveBeenCalled(); expect(s.stopFormSession).toHaveBeenCalled();
    expect(s.requestPermission).not.toHaveBeenCalled();
  });
});
