import unittest
from pathlib import Path


class TemplateWebcamTests(unittest.TestCase):
    def test_index_template_contains_realtime_coach_controls(self):
        html = Path("templates/index.html").read_text(encoding="utf-8", errors="ignore")
        self.assertIn("exerciseSelect", html)
        self.assertIn("modeSelect", html)
        self.assertIn("recognizedAction", html)
        self.assertIn("recognizedActionMetric", html)
        self.assertIn("auto", html)
        self.assertIn("manual", html)
        self.assertIn("openCameraBtn", html)
        self.assertIn("startSetBtn", html)
        self.assertIn("pauseSetBtn", html)
        self.assertIn("endSetBtn", html)
        self.assertIn("/api/session/frame", html)
        self.assertIn("speechSynthesis", html)
        self.assertIn("实时健身动作纠错", html)
        self.assertIn("打开摄像头", html)
        self.assertIn("开始训练", html)
        self.assertIn("自动识别", html)


if __name__ == "__main__":
    unittest.main()
