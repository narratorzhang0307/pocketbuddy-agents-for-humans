"""Restricted live API for Pocket Buddy. No video uploads, file serving, debug UI or saved frames."""
from dataclasses import dataclass
import secrets
import threading
import time
import uuid

from flask import Flask, jsonify, request
from werkzeug.exceptions import HTTPException

from src.live_coach import EXERCISES, LiveCoachEngine, LiveCoachSession, normalize_exercise


@dataclass
class Session:
    state: LiveCoachSession
    token: str
    recognizer: object
    mode: str
    touched: float
    last_frame: float = -100.0


def create_app(runtime=None, clock=time.monotonic):
    if runtime is None:
        from coach_runtime import CoachRuntime
        runtime = CoachRuntime()
    app = Flask(__name__, static_folder=None)
    app.config.update(MAX_CONTENT_LENGTH=768 * 1024, SESSION_TTL=600, MAX_SESSIONS=8)
    sessions = {}
    lock = threading.RLock()
    inference_lock = threading.Lock()
    engine = LiveCoachEngine()
    allowed_origins = {"https://pocketbuddy.throughtheglass.art", "capacitor://localhost"}

    @app.before_request
    def origin_and_expiration():
        origin = request.headers.get("Origin")
        if origin and origin not in allowed_origins:
            return jsonify(error="origin_not_allowed"), 403
        with lock:
            for sid in [sid for sid, session in sessions.items() if clock() - session.touched > app.config["SESSION_TTL"]]:
                sessions.pop(sid, None)

    @app.after_request
    def headers(response):
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Vary"] = "Origin"
        if request.headers.get("Origin") in allowed_origins:
            response.headers["Access-Control-Allow-Origin"] = request.headers["Origin"]
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
            response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        return response

    @app.errorhandler(HTTPException)
    def http_error(error):
        return jsonify(error=error.name), error.code

    @app.route("/api/<path:unused>", methods=["OPTIONS"])
    def preflight(unused):
        return "", 204

    @app.get("/api/health")
    def health():
        return jsonify(ok=True, protocol="pocket-lianlema/v1", models=runtime.info,
                       frameStorage="none", inference="server", minFrameIntervalMs=500)

    def payload():
        value = request.get_json(silent=True)
        return value if isinstance(value, dict) else {}

    def authenticated(data):
        sid = data.get("session_id")
        session = sessions.get(sid) if isinstance(sid, str) else None
        supplied = request.headers.get("Authorization", "")
        if session is None or not secrets.compare_digest(supplied, "Bearer " + session.token):
            return None
        session.touched = clock()
        return session

    @app.post("/api/session/start")
    def start():
        data = payload()
        if data.get("consent") is not True:
            return jsonify(error="请先确认服务器分析与画面不保存说明"), 400
        if not isinstance(data.get("exercise"), str):
            return jsonify(error="unsupported_exercise"), 400
        try:
            exercise = normalize_exercise(data.get("exercise"))
        except ValueError:
            return jsonify(error="unsupported_exercise"), 400
        mode = data.get("mode", "manual")
        if not isinstance(mode, str) or mode not in {"manual", "auto"}:
            return jsonify(error="invalid_mode"), 400
        with lock:
            if len(sessions) >= app.config["MAX_SESSIONS"]:
                return jsonify(error="服务繁忙，请稍后重试"), 503
            sid, token = uuid.uuid4().hex, secrets.token_urlsafe(32)
            state = LiveCoachSession(session_id=sid, exercise=exercise, started_at=time.time())
            sessions[sid] = Session(state, token, runtime.new_recognizer(), mode, clock())
        return jsonify(session_id=sid, session_token=token, exercise=exercise,
                       exercise_label=EXERCISES[exercise]["label"], mode=mode)

    @app.post("/api/session/frame")
    def frame():
        data = payload()
        with lock:
            session = authenticated(data)
            if session is None:
                return jsonify(error="session_expired_or_unauthorized"), 401
            if clock() - session.last_frame < 0.45:
                return jsonify(error="frame_rate_limited"), 429
            session.last_frame = clock()
        if not inference_lock.acquire(blocking=False):
            return jsonify(error="inference_busy"), 503
        try:
            points, evidence = runtime.estimate(data.get("image_data"))
            active = session.state.exercise
            recognized = None
            recognition_state = "manual"
            if session.mode == "auto":
                recognized = session.recognizer.push_frame(points) if points is not None else None
                recognition_state = "recognized" if recognized else ("warming_up" if points is not None else "no_person")
                if recognized:
                    active = normalize_exercise(recognized["action"])
            result = engine.evaluate(active, points, session.state)
            return jsonify(**result, **evidence, exercise=session.state.exercise,
                           active_exercise_label=EXERCISES[active]["label"], mode=session.mode,
                           recognition_state=recognition_state,
                           recognized_action=recognized["action"] if recognized else "",
                           recognized_confidence=recognized["confidence"] if recognized else 0)
        except ValueError as error:
            return jsonify(error=str(error)), 400
        except Exception:
            app.logger.exception("Coach inference failed; request images are never logged")
            return jsonify(error="模型分析失败，请稍后重试"), 503
        finally:
            inference_lock.release()

    @app.post("/api/session/stop")
    def stop():
        with lock:
            session = authenticated(payload())
            if session is None:
                return jsonify(error="session_expired_or_unauthorized"), 401
            sessions.pop(session.state.session_id, None)
        return jsonify(summary=engine.build_summary(session.state))

    return app
