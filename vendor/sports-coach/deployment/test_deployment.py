"""Deployment boundaries using synthetic landmarks, not camera accuracy tests."""
import hashlib
import json
from pathlib import Path
import threading
import unittest
from unittest.mock import patch
import urllib.error
import urllib.request

from healthcheck import healthy
from server import serve
from verify import SYNTH


class DeploymentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = serve(0, "127.0.0.1")
        cls.worker = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.worker.start()
        cls.url = f"http://127.0.0.1:{cls.httpd.server_address[1]}"

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.worker.join()

    def post(self, payload, route="/analyze/basketball"):
        request = urllib.request.Request(self.url + route,
            data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
        try:
            response = urllib.request.urlopen(request, timeout=5)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            return response.status, json.loads(response.read())

    def test_imported_rules_and_configs_keep_their_source_hashes(self):
        root = Path(__file__).parent
        manifest = json.loads((root / "source-manifest.json").read_text())
        unchanged = set(manifest["sha256"]) - set(manifest["adapted_files"])
        self.assertEqual(len(unchanged), 12)
        for name in unchanged:
            self.assertEqual(hashlib.sha256((root / name).read_bytes()).hexdigest(),
                             manifest["sha256"][name], name)

    def test_health_probe_checks_the_running_service_and_reports_failures(self):
        self.assertTrue(healthy(self.url))
        with patch("server.engines", side_effect=ValueError("broken rule config")):
            self.assertFalse(healthy(self.url))
        other = serve(0, "127.0.0.1")
        stopped_url = f"http://127.0.0.1:{other.server_address[1]}"
        other.server_close()
        self.assertFalse(healthy(stopped_url))

    def test_invalid_inputs_return_errors_without_scores(self):
        seq, action = SYNTH["basketball"]
        valid = dict(keypoints=seq.tolist(), cls_id=action, fps=30)
        variants = [None, [], dict(valid, cls_id=True), dict(valid, cls_id=1.5),
                    dict(valid, cls_id=99), dict(valid, fps=0), dict(valid, fps="fast"),
                    dict(valid, fps=float("nan")), dict(valid, keypoints=[]),
                    dict(valid, keypoints=seq.tolist() * 4),
                    {"keypoints": seq.tolist(), "cls_name": "unknown"},
                    {"keypoints": seq.tolist()}]
        nan = dict(valid, keypoints=seq.tolist())
        nan["keypoints"][0][0][0] = float("nan")
        variants.append(nan)
        for payload in variants:
            with self.subTest(payload=str(payload)[:80]):
                status, body = self.post(payload)
                self.assertEqual(status, 400)
                self.assertNotIn("score", body)
        self.assertEqual(self.post(valid, "/analyze/missing")[0], 404)
        self.assertEqual(self.post({"padding": "x" * 270000})[0], 413)
        self.assertTrue(healthy(self.url))

    def test_camera_alias_runs_the_same_rules(self):
        seq, action = SYNTH["basketball"]
        payload = dict(keypoints=seq.tolist(), cls_id=action, fps=30)
        status, result = self.post(payload)
        self.assertEqual(status, 200)
        self.assertTrue(result["valid"])
        self.assertEqual(result, self.post(payload, "/camera/analyze/basketball")[1])


if __name__ == "__main__":
    unittest.main()
