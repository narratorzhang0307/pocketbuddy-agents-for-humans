"""CPU-only public coach runtime. Reuses the project's real RTMO and ST-GCN models."""
from pathlib import Path
import base64
import io
import time

import cv2
import numpy as np
import onnxruntime as ort
from PIL import Image
import torch
from rtmlib import RTMO

from src.fitness_infer import FitnessActionRecognizer, load_fitness_action_recognizer


class CoachRuntime:
    def __init__(self, model_dir=None):
        model_dir = Path(model_dir or Path(__file__).parent / "model")
        pose_path = model_dir / "rtmo-s_8xb32-600e_body7-640x640-dac2bf74_20231211.onnx"
        action_path = model_dir / "mmfit_pose11cls_stride48_best.pth"
        if not pose_path.is_file() or not action_path.is_file():
            raise RuntimeError("Required coach model files are missing")
        torch.set_num_threads(1)
        cv2.setNumThreads(1)
        # RTMO directly respects this local checkpoint; Body may replace it with a download URL.
        self.pose = RTMO(str(pose_path), backend="onnxruntime", device="cpu")
        # RTMLib 0.0.15 does not expose SessionOptions. Replace its initial session before use.
        del self.pose.session
        options = ort.SessionOptions()
        options.intra_op_num_threads = 1
        options.inter_op_num_threads = 1
        self.pose.session = ort.InferenceSession(str(pose_path), options, providers=["CPUExecutionProvider"])
        recognizer = load_fitness_action_recognizer(action_path, device=torch.device("cpu"), min_confidence=0.35)
        if recognizer is None:
            raise RuntimeError("ST-GCN model did not load")
        self.action_model = recognizer.model
        # Health becomes ready only after both real inference paths execute successfully.
        self.pose(np.zeros((640, 640, 3), dtype=np.uint8))
        recognizer.predict_window(np.zeros((2, 48, 17), dtype=np.float32))
        self.info = {"pose": "RTMO-s / RTMPose", "action": "ST-GCN / MM-Fit 11 classes", "device": "cpu", "ready": True}

    def new_recognizer(self):
        # Weights are shared, but each user's rolling window is private to their session.
        return FitnessActionRecognizer(self.action_model, window_size=48, min_confidence=0.35)

    def estimate(self, image_data):
        if not isinstance(image_data, str) or not image_data.startswith(("data:image/jpeg;base64,", "data:image/png;base64,")):
            raise ValueError("需要 JPEG 或 PNG 图像帧")
        try:
            raw = base64.b64decode(image_data.split(",", 1)[1], validate=True)
            if len(raw) > 512 * 1024:
                raise ValueError("图像过大，请降低分辨率")
            with Image.open(io.BytesIO(raw)) as image:
                if image.format not in {"JPEG", "PNG"} or image.width * image.height > 1600 * 1600:
                    raise ValueError("图像格式或尺寸不支持")
                image.verify()
            frame = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
            if frame is None:
                raise ValueError("无法读取图像帧")
        except Exception as error:
            raise ValueError("无效或过大的图像帧") from error
        started = time.monotonic()
        keypoints, scores = self.pose(frame)
        elapsed = round((time.monotonic() - started) * 1000, 1)
        if len(keypoints) == 0:
            return None, {"visible_keypoints": 0, "inference_ms": elapsed}
        index = int(np.argmax(np.asarray(scores).mean(axis=1)))
        points, confidence = np.asarray(keypoints[index], dtype=np.float32), np.asarray(scores[index])
        visible = int(np.count_nonzero(confidence >= 0.3))
        usable = visible >= 12 and bool(np.all(confidence[[5, 6, 11, 12]] >= 0.3))
        return (points if usable else None), {"visible_keypoints": visible, "inference_ms": elapsed}
