"""Probe a real running coach using generated empty pixels; never reads camera or user media."""
import base64
import io
import json
import sys
import urllib.error
import urllib.request

from PIL import Image

base = sys.argv[1].rstrip("/")


def request(route, data=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(base + "/api/" + route,
                                 data=json.dumps(data).encode() if data is not None else None, headers=headers)
    with urllib.request.urlopen(req, timeout=20) as response:
        return json.load(response)


health = request("health")
assert health["models"]["ready"] is True
session = request("session/start", {"exercise": "squats", "mode": "manual", "consent": True})
try:
    buffer = io.BytesIO()
    Image.new("RGB", (640, 480), (0, 0, 0)).save(buffer, format="JPEG")
    result = request("session/frame", {"session_id": session["session_id"],
                    "image_data": "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode()}, session["session_token"])
    assert result["rep_count"] == 0
    assert result["visible_keypoints"] == 0
    assert result["errors"][0]["code"] == "no_person"
    print(json.dumps({"real_model_ready": True, "empty_frame": "no_person", "rep_count": 0,
                      "inference_ms": result["inference_ms"], "frame_storage": health["frameStorage"]}))
finally:
    request("session/stop", {"session_id": session["session_id"]}, session["session_token"])
