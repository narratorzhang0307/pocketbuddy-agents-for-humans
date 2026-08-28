"""Loopback-only, authenticated, single-flight SAM worker supervisor."""
import hashlib
import hmac
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from worker import CHECKPOINT_SHA256, MODEL, VERSION, decode_request

LIMIT = 1600000
SLOT = threading.Lock()


def preflight():
    checkpoint = Path(os.environ.get("PHOTOS_SAM_CHECKPOINT", ""))
    if not checkpoint.is_file():
        raise RuntimeError("sam_checkpoint_missing")
    digest = hashlib.sha256()
    with checkpoint.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    if digest.hexdigest() != CHECKPOINT_SHA256:
        raise RuntimeError("sam_checkpoint_hash_mismatch")
    if any(importlib.util.find_spec(name) is None for name in ("torch", "torchvision", "sam2")):
        raise RuntimeError("sam_dependencies_missing")
    if len(os.environ.get("PHOTOS_HARNESS_TOKEN", "")) < 32:
        raise RuntimeError("private_service_token_required")


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def reply(self, code, value):
        body = json.dumps(value, ensure_ascii=False, allow_nan=False).encode("utf-8")
        try:
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def authorized(self):
        expected = "Bearer " + os.environ["PHOTOS_HARNESS_TOKEN"]
        if hmac.compare_digest(self.headers.get("Authorization", ""), expected):
            return True
        self.reply(403, {"error": "forbidden"})
        return False

    def do_GET(self):
        if not self.authorized():
            return
        if self.path != "/health":
            self.reply(404, {"error": "not_found"})
            return
        self.reply(200, {"ready": True, "version": VERSION, "model": MODEL,
                         "checkpointSha256": CHECKPOINT_SHA256, "backend": "cpu",
                         "busy": SLOT.locked(), "imagePersisted": False})

    def do_POST(self):
        if not self.authorized():
            return
        if self.path != "/segment":
            self.reply(404, {"error": "not_found"})
            return
        if not SLOT.acquire(blocking=False):
            self.reply(429, {"error": "sam_busy"})
            return
        try:
            self.connection.settimeout(12)
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= LIMIT or self.headers.get("Transfer-Encoding"):
                self.reply(413, {"error": "bounded_json_required"})
                return
            body = self.rfile.read(size)
            payload = json.loads(body)
            decode_request(payload)
            result = subprocess.run([sys.executable, str(Path(__file__).with_name("worker.py"))],
                                    input=body, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                    timeout=150, check=False)
            if result.returncode or len(result.stdout) > 4 * 1024 * 1024:
                self.reply(503, {"error": "sam_inference_failed"})
                return
            self.reply(200, json.loads(result.stdout))
        except subprocess.TimeoutExpired:
            self.reply(504, {"error": "sam_timeout"})
        except (ValueError, TypeError, KeyError, OSError):
            self.reply(400, {"error": "invalid_image_or_grounding"})
        finally:
            SLOT.release()


if __name__ == "__main__":
    preflight()
    print("photos-harness ready; cpu, single-flight, no image persistence", flush=True)
    ThreadingHTTPServer(("127.0.0.1", int(os.environ.get("PHOTOS_SAM_PORT", "4030"))), Handler).serve_forever()
