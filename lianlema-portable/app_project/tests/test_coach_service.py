import unittest
import numpy as np

from coach_service import create_app


class FakeRuntime:
    info = {"ready": True, "pose": "unit-test-only"}

    def __init__(self):
        self.recognizers = []

    def new_recognizer(self):
        class Recognizer:
            calls = 0

            def push_frame(self, points):
                self.calls += 1
                return None
        value = Recognizer()
        self.recognizers.append(value)
        return value

    def estimate(self, data):
        if data != "test-frame":
            raise ValueError("invalid_frame")
        return np.ones((17, 2), dtype=np.float32), {"visible_keypoints": 17, "inference_ms": 1}


class CoachServiceTests(unittest.TestCase):
    def setUp(self):
        self.now = 100.0
        self.runtime = FakeRuntime()
        self.app = create_app(self.runtime, clock=lambda: self.now)
        self.client = self.app.test_client()

    def start(self, **overrides):
        return self.client.post("/api/session/start", json={"exercise": "squats", "mode": "auto", "consent": True, **overrides})

    def frame(self, session, **overrides):
        return self.client.post("/api/session/frame", headers={"Authorization": "Bearer " + session["session_token"]},
                                json={"session_id": session["session_id"], "image_data": "test-frame", **overrides})

    def test_health_and_no_legacy_file_routes(self):
        self.assertTrue(self.client.get("/api/health").json["models"]["ready"])
        self.assertEqual(self.client.get("/api/health").json["frameStorage"], "none")
        for route in ["/", "/upload", "/chat", "/static/results/test.jpg"]:
            self.assertEqual(self.client.get(route).status_code, 404)

    def test_explicit_consent_and_valid_action_required(self):
        self.assertEqual(self.start(consent=False).status_code, 400)
        self.assertEqual(self.start(exercise="invalid").status_code, 400)
        self.assertEqual(self.start(mode="invalid").status_code, 400)

    def test_session_token_required_and_isolated(self):
        first, second = self.start().json, self.start().json
        wrong = {**first, "session_token": second["session_token"]}
        self.assertEqual(self.frame(wrong).status_code, 401)
        self.assertEqual(self.frame(first).status_code, 200)
        self.assertEqual([r.calls for r in self.runtime.recognizers], [1, 0])

    def test_expiration_stop_and_frame_throttling(self):
        session = self.start().json
        self.assertEqual(self.frame(session).status_code, 200)
        self.assertEqual(self.frame(session).status_code, 429)
        self.now += 601
        self.assertEqual(self.frame(session).status_code, 401)
        session = self.start().json
        response = self.client.post("/api/session/stop", json={"session_id": session["session_id"]}, headers={"Authorization": "Bearer " + session["session_token"]})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.frame(session).status_code, 401)

    def test_bounded_sessions_and_payload(self):
        self.app.config["MAX_SESSIONS"] = 1
        self.assertEqual(self.start().status_code, 200)
        self.assertEqual(self.start().status_code, 503)
        self.assertEqual(self.client.post("/api/session/frame", json={"image_data": "x" * (800 * 1024)}).status_code, 413)

    def test_cors_not_wildcard_and_bad_frames_rejected(self):
        for origin in ["https://pocketbuddy.throughtheglass.art", "capacitor://localhost"]:
            response = self.client.options("/api/session/start", headers={"Origin": origin})
            self.assertEqual(response.headers["Access-Control-Allow-Origin"], origin)
        self.assertEqual(self.client.get("/api/health", headers={"Origin": "https://other.example"}).status_code, 403)
        session = self.start().json
        self.assertEqual(self.frame(session, image_data="invalid").status_code, 400)


if __name__ == "__main__":
    unittest.main()
