import io
import os
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

import numpy as np


class FakeSTGCN:
    def __init__(self, *args, **kwargs):
        self.loaded = False

    def load_state_dict(self, state_dict):
        self.loaded = True

    def to(self, device):
        return self

    def eval(self):
        return self

    def predict(self, x):
        return np.array([[0]]), np.array([[0.95]])


class FakeRecognizer:
    def __init__(self, result=None):
        self.result = result

    def push_frame(self, _frame):
        return self.result


def load_web_app():
    sys.modules.pop("web_app", None)
    fake_cv2 = types.ModuleType("cv2")
    fake_cv2.CAP_PROP_FOURCC = 6
    fake_cv2.CAP_PROP_FRAME_COUNT = 7
    fake_cv2.CAP_PROP_POS_FRAMES = 1

    class FakeCapture:
        def __init__(self, path):
            self.path = path

        def get(self, _prop):
            return 1

        def set(self, _prop, _value):
            return True

        def read(self):
            return False, None

        def release(self):
            return True

    fake_cv2.VideoCapture = FakeCapture
    fake_cv2.line = lambda *args, **kwargs: None
    fake_cv2.circle = lambda *args, **kwargs: None
    fake_cv2.imwrite = lambda *args, **kwargs: True

    fake_rtmpose = types.ModuleType("src.rtmpose_tran")
    fake_rtmpose.RTM_Pose_Tran = lambda *args, **kwargs: (
        True,
        np.zeros((10, 17, 2), dtype=np.float32),
    )

    fake_datapro = types.ModuleType("src.datapro")
    fake_datapro.PreProcess = lambda keypoints: np.zeros((2, 250, 17), dtype=np.float32)

    fake_score = types.ModuleType("src.score")
    fake_score.Score = lambda *args, **kwargs: 0.9

    fake_model = types.ModuleType("src.model")
    fake_model.ST_GCN = FakeSTGCN

    fake_llm = types.ModuleType("src.local_llm")
    fake_llm.chat_with_ollama_model = lambda *args, **kwargs: {
        "message": {"content": "[动作评价] 好\n[评分分析] 稳定\n[心率评估] 正常\n[改进建议] 继续\n[鼓励话语] 加油"}
    }

    with tempfile.TemporaryDirectory() as runtime_dir, tempfile.TemporaryDirectory() as video_dir:
        with patch.dict(
            os.environ,
            {"POSE_RUNTIME_DIR": runtime_dir, "POSE_VIDEO_DIR": video_dir},
            clear=False,
        ):
            with patch.dict(
                sys.modules,
                {
                    "cv2": fake_cv2,
                    "src.rtmpose_tran": fake_rtmpose,
                    "src.datapro": fake_datapro,
                    "src.score": fake_score,
                    "src.model": fake_model,
                    "src.local_llm": fake_llm,
                },
            ):
                import web_app  # pylint: disable=import-outside-toplevel

                return web_app


class WebAppRouteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.web_app = load_web_app()

    def setUp(self):
        self.client = self.web_app.app.test_client()

    def test_webcam_upload_requires_video_field(self):
        response = self.client.post("/webcam-upload", data={}, content_type="multipart/form-data")
        self.assertEqual(response.status_code, 200)
        self.assertIn("未选择文件".encode("utf-8"), response.data)

    def test_webcam_upload_uses_shared_processor(self):
        with patch.object(self.web_app, "process_video_file", create=True) as mock_process:
            mock_process.return_value = {
                "action_name": "测试动作",
                "action_id": 0,
                "score": 0.9,
                "heart_rate": 90,
                "duration": 1.0,
                "frame_count": 10,
                "feedback": {
                    "evaluation": "",
                    "analysis": "",
                    "hr_eval": "",
                    "suggestion": "",
                    "encouragement": "",
                },
                "vis_image": "",
            }
            response = self.client.post(
                "/webcam-upload",
                data={"video": (io.BytesIO(b"fake-video"), "clip.webm")},
                content_type="multipart/form-data",
            )
            self.assertEqual(response.status_code, 200)
            self.assertTrue(mock_process.called)


    def test_start_session_requires_known_exercise(self):
        response = self.client.post("/api/session/start", json={"exercise": "burpee"})

        self.assertEqual(response.status_code, 400)
        self.assertIn("error", response.get_json())

    def test_frame_endpoint_returns_live_feedback(self):
        start = self.client.post("/api/session/start", json={"exercise": "squats"})
        self.assertEqual(start.status_code, 200)
        session_id = start.get_json()["session_id"]

        with patch.object(
            self.web_app,
            "extract_live_pose",
            return_value=np.zeros((17, 2), dtype=np.float32),
            create=True,
        ):
            response = self.client.post(
                "/api/session/frame",
                json={
                    "session_id": session_id,
                    "image_data": "data:image/jpeg;base64,ZmFrZQ==",
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertIn("rep_count", response.get_json())
        self.assertIn("primary_cue", response.get_json())
        self.assertEqual(response.get_json()["mode"], "manual")
        self.assertEqual(response.get_json()["active_exercise"], "squats")
        self.assertEqual(response.get_json()["active_exercise_label"], "深蹲")

    def test_frame_endpoint_uses_auto_recognition_when_available(self):
        start = self.client.post("/api/session/start", json={"exercise": "squats"})
        self.assertEqual(start.status_code, 200)
        session_id = start.get_json()["session_id"]

        with patch.object(
            self.web_app,
            "extract_live_pose",
            return_value=np.ones((17, 2), dtype=np.float32),
            create=True,
        ):
            with patch.object(
                self.web_app,
                "fitness_action_recognizer",
                FakeRecognizer({"action": "dumbbell_shoulder_press", "label": 4, "confidence": 0.91}),
                create=True,
            ):
                response = self.client.post(
                    "/api/session/frame",
                    json={
                        "session_id": session_id,
                        "image_data": "data:image/jpeg;base64,ZmFrZQ==",
                        "mode": "auto",
                    },
                )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["mode"], "auto")
        self.assertEqual(payload["recognized_action"], "dumbbell_shoulder_press")
        self.assertEqual(payload["active_exercise"], "dumbbell_shoulder_press")
        self.assertEqual(payload["recognition_state"], "recognized")
        self.assertEqual(payload["coaching_mode"], "specialized")
        self.assertEqual(payload["active_exercise_label"], "哑铃肩推")

    def test_frame_endpoint_auto_mode_falls_back_while_warming_up(self):
        start = self.client.post("/api/session/start", json={"exercise": "lunges"})
        self.assertEqual(start.status_code, 200)
        session_id = start.get_json()["session_id"]

        with patch.object(
            self.web_app,
            "extract_live_pose",
            return_value=np.ones((17, 2), dtype=np.float32),
            create=True,
        ):
            with patch.object(
                self.web_app,
                "fitness_action_recognizer",
                FakeRecognizer(None),
                create=True,
            ):
                response = self.client.post(
                    "/api/session/frame",
                    json={
                        "session_id": session_id,
                        "image_data": "data:image/jpeg;base64,ZmFrZQ==",
                        "mode": "auto",
                    },
                )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["mode"], "auto")
        self.assertEqual(payload["recognized_action"], "")
        self.assertEqual(payload["active_exercise"], "lunges")
        self.assertEqual(payload["recognition_state"], "warming_up")
        self.assertEqual(payload["active_exercise_label"], "弓步")

    def test_frame_endpoint_auto_mode_returns_generic_state_for_non_specialized_action(self):
        start = self.client.post("/api/session/start", json={"exercise": "situps"})
        self.assertEqual(start.status_code, 200)
        session_id = start.get_json()["session_id"]

        with patch.object(
            self.web_app,
            "extract_live_pose",
            return_value=np.ones((17, 2), dtype=np.float32),
            create=True,
        ):
            with patch.object(
                self.web_app,
                "fitness_action_recognizer",
                FakeRecognizer({"action": "situps", "label": 6, "confidence": 0.88}),
                create=True,
            ):
                response = self.client.post(
                    "/api/session/frame",
                    json={
                        "session_id": session_id,
                        "image_data": "data:image/jpeg;base64,ZmFrZQ==",
                        "mode": "auto",
                    },
                )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["active_exercise"], "situps")
        self.assertEqual(payload["recognition_state"], "recognized")
        self.assertEqual(payload["coaching_mode"], "generic")
        self.assertEqual(payload["active_exercise_label"], "仰卧起坐")
        self.assertTrue("节奏" in payload["primary_cue"] or "稳定" in payload["primary_cue"])

    def test_stop_session_returns_summary(self):
        start = self.client.post("/api/session/start", json={"exercise": "squats"})
        self.assertEqual(start.status_code, 200)

        response = self.client.post(
            "/api/session/stop",
            json={"session_id": start.get_json()["session_id"]},
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn("summary", response.get_json())


if __name__ == "__main__":
    unittest.main()
