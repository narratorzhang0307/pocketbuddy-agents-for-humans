#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""运动分析 HTTP 服务（线上相机与分析接口）。

相机链路约定：
  线上相机端（浏览器/客户端）负责采集视频并提取 COCO-17 关键点序列
  （MediaPipe 浏览器版 / 客户端 pose 均可），按 30 帧滑窗 POST 到本服务，
  服务端执行五项运动的规则引擎，返回 可解释的动作评分 + 错误列表 + 教学纠正。

接口：
  GET  /health                    健康检查（Python/NumPy/PyYAML/规则文件状态）
  GET  /sports                    各运动类别表与错误码词表
  POST /analyze/{sport}           分析一个滑窗（也即相机流的分析入口）
       body: {"keypoints": [[[x,y,conf]*17]*T],
              "cls_id": 1..N 或 "cls_name": "高远球", "fps": 30}
  POST /camera/analyze/{sport}    相机流分析别名（与 /analyze 同义）

仅依赖 Python 标准库 + NumPy + PyYAML。
"""
import argparse
import importlib
import json
import os
import sys
from functools import lru_cache
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
import yaml

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from rules_engine import SPORTS, get_engine, sport_info  # noqa: E402

_PKG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "rules_engine")
_CONFIGS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "configs")

MAX_BODY = 256 * 1024


@lru_cache(maxsize=1)
def engines():
    """懒加载并缓存各运动引擎（进程内单例，线程安全只读）。"""
    return {sport: get_engine(sport, _CONFIGS_DIR) for sport in SPORTS}


def rules_status():
    """规则文件完整性检查（评审要求：打包 Python/NumPy/PyYAML/规则文件）。"""
    files = {"modules": sorted(f"{s}.py" for s in SPORTS
                               if os.path.exists(os.path.join(_PKG_DIR, f"{s}.py"))),
             "configs": sorted(f"{s}.yaml" for s in SPORTS
                               if os.path.exists(os.path.join(_CONFIGS_DIR, f"{s}.yaml")))}
    files["complete"] = (len(files["modules"]) == len(SPORTS)
                         and len(files["configs"]) == len(SPORTS))
    return files


class Handler(BaseHTTPRequestHandler):
    server_version = "SportsAnalysis/1.0"

    # ---------- 基础 ----------
    def _send(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False, allow_nan=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):  # 安静日志
        pass

    # ---------- GET ----------
    def do_GET(self):
        path = self.path.split("?")[0].rstrip("/")
        if path == "/health":
            try:
                import yaml as _y
                pyyaml_ver = getattr(_y, "__version__", "unknown")
            except Exception:
                pyyaml_ver = "missing"
            st = rules_status()
            try:
                ready = st["complete"] and len(engines()) == len(SPORTS)
            except (OSError, ValueError, TypeError, ImportError, yaml.YAMLError):
                ready = False
            self._send(200 if ready else 503, {
                "status": "ok" if ready else "degraded",
                "python": sys.version.split()[0],
                "numpy": np.__version__,
                "pyyaml": pyyaml_ver,
                "rules_files": st,
                "sports": list(SPORTS),
            })
        elif path == "/sports":
            self._send(200, {s: sport_info(s) for s in SPORTS})
        else:
            self._send(404, {"error": f"unknown path {path}"})

    # ---------- POST ----------
    def do_POST(self):
        path = self.path.split("?")[0].rstrip("/")
        parts = [p for p in path.split("/") if p]
        if len(parts) == 2 and parts[0] == "analyze":
            sport = parts[1]
        elif len(parts) == 3 and parts[0] == "camera" and parts[1] == "analyze":
            sport = parts[2]
        else:
            self._send(404, {"error": f"unknown path {path}",
                             "usage": "POST /analyze/{sport} 或 /camera/analyze/{sport}"})
            return
        if sport not in SPORTS:
            self._send(404, {"error": "unknown sport"})
            return
        if not self.headers.get("Content-Type", "").startswith("application/json"):
            self._send(415, {"error": "JSON required"})
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            if not 0 < length <= MAX_BODY:
                self._send(413, {"error": "request size exceeds limit"})
                return
            body = json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception as e:
            self._send(400, {"error": f"bad json body: {e}"})
            return

        if not isinstance(body, dict):
            self._send(400, {"error": "request must be an object"})
            return
        kps = body.get("keypoints")
        if not isinstance(kps, list) or not kps:
            self._send(400, {"error": "keypoints 为必填项：[[[x,y,conf]*17]*T]"})
            return
        try:
            seq = np.asarray(kps, dtype=np.float32)
        except Exception as e:
            self._send(400, {"error": f"keypoints 形状非法: {e}"})
            return
        if seq.ndim != 3 or seq.shape[1:] != (17, 3) or not 30 <= len(seq) <= 90:
            self._send(400, {"error": f"keypoints 形状需为 [T][17][3]，收到 {list(seq.shape)}"})
            return
        if (not np.isfinite(seq).all() or (seq[:, :, 2] < 0).any()
                or (seq[:, :, 2] > 1).any() or (seq[:, :, :2] < -1).any()
                or (seq[:, :, :2] > 2).any()):
            self._send(400, {"error": "invalid landmark values"})
            return

        module = importlib.import_module(f"rules_engine.{sport}")
        cls_id = body.get("cls_id")
        cls_name = body.get("cls_name")
        names = list(module.CLASS_NAMES)
        if cls_id is None and cls_name:
            match = [i for i, n in enumerate(names) if n == str(cls_name).strip()]
            if not match:
                self._send(400, {"error": "unknown action name"})
                return
            cls_id = match[0]
        if cls_id is None:
            self._send(400, {"error": "select an action"})
            return
        if type(cls_id) is not int:
            self._send(400, {"error": "cls_id 需为整数"})
            return
        if not (0 <= cls_id < len(names)):
            self._send(400, {"error": f"cls_id 超出范围 0..{len(names)-1}"})
            return

        fps = body.get("fps", 30)
        if type(fps) not in (int, float) or not np.isfinite(fps) or not 4 <= fps <= 60:
            self._send(400, {"error": "fps must be between 4 and 60"})
            return
        asmt = engines()[sport].assess(seq, cls_id, fps=fps)
        payload = asmt.to_dict()
        payload.update({
            "sport": sport,
            "correction_voice": module.coach_voice(asmt) if asmt.valid else "",
            "coach_text": module.coach_full(asmt) if asmt.valid else "",
        })
        self._send(200, payload)


def serve(port=8000, host="0.0.0.0"):
    httpd = ThreadingHTTPServer((host, port), Handler)
    print(f"[运动分析服务] listening on http://{host}:{httpd.server_address[1]}  sports={list(SPORTS)}", flush=True)
    return httpd


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="运动分析 HTTP 服务")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--host", default="0.0.0.0")
    args = ap.parse_args()
    httpd = serve(args.port, args.host)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        httpd.shutdown()
