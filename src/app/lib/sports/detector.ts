import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import simdJs from '@mediapipe/tasks-vision/vision_wasm_internal.js?url';
import simdWasm from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url';
import plainJs from '@mediapipe/tasks-vision/vision_wasm_nosimd_internal.js?url';
import plainWasm from '@mediapipe/tasks-vision/vision_wasm_nosimd_internal.wasm?url';
import modelAssetPath from '../../../../vendor/her-motion/public/models/pose_landmarker_lite.task?url';

export async function createSportsPoseDetector(): Promise<PoseLandmarker> {
  const simd = await FilesetResolver.isSimdSupported();
  return PoseLandmarker.createFromOptions({
    wasmLoaderPath: simd ? simdJs : plainJs,
    wasmBinaryPath: simd ? simdWasm : plainWasm,
  }, {
    baseOptions: { modelAssetPath, delegate: 'CPU' },
    runningMode: 'VIDEO', numPoses: 1,
    minPoseDetectionConfidence: .6, minPosePresenceConfidence: .6, minTrackingConfidence: .6,
  });
}
