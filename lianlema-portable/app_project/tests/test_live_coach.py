import unittest

import numpy as np

from src.live_coach import EXERCISES, LiveCoachEngine, LiveCoachSessionStore


def _empty_pose():
    return np.zeros((17, 2), dtype=np.float32)


def make_squat_pose(knee_angle=170.0, knee_span=120.0, ankle_span=150.0, torso_shift=0.0):
    pose = _empty_pose()
    center_x = 200.0
    knee_y = 280.0
    ankle_y = 360.0
    segment = 82.0

    left_ankle_x = center_x - ankle_span / 2.0
    right_ankle_x = center_x + ankle_span / 2.0
    left_knee_x = center_x - knee_span / 2.0
    right_knee_x = center_x + knee_span / 2.0

    bend = np.radians(180.0 - knee_angle)
    hip_dx = segment * np.sin(bend)
    hip_dy = segment * np.cos(bend)

    pose[15] = [left_ankle_x, ankle_y]
    pose[16] = [right_ankle_x, ankle_y]
    pose[13] = [left_knee_x, knee_y]
    pose[14] = [right_knee_x, knee_y]
    pose[11] = [left_knee_x + hip_dx, knee_y - hip_dy]
    pose[12] = [right_knee_x - hip_dx, knee_y - hip_dy]
    pose[5] = [pose[11][0] + torso_shift, pose[11][1] - 92.0]
    pose[6] = [pose[12][0] + torso_shift, pose[12][1] - 92.0]
    pose[7] = [pose[5][0] - 18.0, pose[5][1] + 52.0]
    pose[8] = [pose[6][0] + 18.0, pose[6][1] + 52.0]
    pose[9] = [pose[7][0] - 14.0, pose[7][1] + 40.0]
    pose[10] = [pose[8][0] + 14.0, pose[8][1] + 40.0]
    return pose


def make_lunge_pose(short_stride=False, torso_shift=0.0):
    pose = _empty_pose()
    pose[5] = [170.0 + torso_shift, 120.0]
    pose[6] = [230.0 + torso_shift, 120.0]
    pose[11] = [180.0, 210.0]
    pose[12] = [220.0, 220.0]
    pose[13] = [210.0, 290.0]
    pose[14] = [240.0, 305.0]
    pose[15] = [185.0, 360.0]
    pose[16] = [250.0 if short_stride else 290.0, 360.0]
    pose[7] = [160.0, 175.0]
    pose[8] = [240.0, 175.0]
    pose[9] = [155.0, 225.0]
    pose[10] = [245.0, 225.0]
    return pose


def make_pushup_pose(sag=False, elbows_wide=False):
    pose = _empty_pose()
    pose[5] = [175.0, 210.0]
    pose[6] = [205.0, 210.0]
    pose[7] = [150.0 if elbows_wide else 170.0, 260.0]
    pose[8] = [230.0 if elbows_wide else 210.0, 260.0]
    pose[9] = [175.0, 315.0]
    pose[10] = [205.0, 315.0]
    pose[11] = [215.0, 270.0 if sag else 225.0]
    pose[12] = [235.0, 270.0 if sag else 225.0]
    pose[13] = [255.0, 250.0 if sag else 228.0]
    pose[14] = [275.0, 250.0 if sag else 228.0]
    pose[15] = [300.0, 235.0]
    pose[16] = [320.0, 235.0]
    return pose


def make_press_pose(bad_lockout=False, lean_back=False):
    pose = _empty_pose()
    shoulder_y = 205.0
    hip_y = 290.0
    wrist_y = 135.0 if bad_lockout else 95.0
    elbow_y = 170.0 if bad_lockout else 130.0
    shoulder_x_shift = -24.0 if lean_back else 0.0

    pose[5] = [165.0 + shoulder_x_shift, shoulder_y]
    pose[6] = [235.0 + shoulder_x_shift, shoulder_y]
    pose[7] = [170.0, elbow_y]
    pose[8] = [230.0, elbow_y]
    pose[9] = [175.0, wrist_y]
    pose[10] = [225.0, wrist_y]
    pose[11] = [180.0, hip_y]
    pose[12] = [220.0, hip_y]
    pose[13] = [185.0, 370.0]
    pose[14] = [215.0, 370.0]
    pose[15] = [188.0, 455.0]
    pose[16] = [212.0, 455.0]
    return pose


def make_row_pose(elbows_flared=False, shallow=False):
    pose = _empty_pose()
    pose[5] = [155.0, 165.0]
    pose[6] = [215.0, 165.0]
    pose[11] = [170.0, 235.0]
    pose[12] = [210.0, 235.0]
    pose[13] = [175.0, 330.0]
    pose[14] = [210.0, 330.0]
    pose[15] = [178.0, 430.0]
    pose[16] = [212.0, 430.0]
    elbow_x = 118.0 if elbows_flared else 162.0
    wrist_x = 96.0 if shallow else 148.0
    pose[7] = [elbow_x, 205.0]
    pose[8] = [230.0, 205.0]
    pose[9] = [wrist_x, 220.0]
    pose[10] = [244.0, 220.0]
    return pose


def make_curl_pose(elbow_forward=False, half_rep=False):
    pose = _empty_pose()
    pose[5] = [170.0, 120.0]
    pose[6] = [220.0, 120.0]
    pose[11] = [178.0, 220.0]
    pose[12] = [212.0, 220.0]
    pose[13] = [184.0, 320.0]
    pose[14] = [210.0, 320.0]
    pose[15] = [188.0, 430.0]
    pose[16] = [208.0, 430.0]
    pose[7] = [195.0 if elbow_forward else 176.0, 190.0]
    pose[8] = [214.0, 190.0]
    pose[9] = [203.0, 165.0 if half_rep else 142.0]
    pose[10] = [222.0, 142.0]
    return pose


class LiveCoachEngineTests(unittest.TestCase):
    def test_exercise_catalog_contains_mmfit_specialized_and_generic_actions(self):
        self.assertIn("squats", EXERCISES)
        self.assertIn("dumbbell_rows", EXERCISES)
        self.assertIn("bicep_curls", EXERCISES)
        self.assertIn("situps", EXERCISES)
        self.assertIn("other", EXERCISES)
        self.assertEqual(EXERCISES["squats"]["label"], "深蹲")

    def test_unknown_exercise_is_rejected(self):
        store = LiveCoachSessionStore()

        with self.assertRaises(ValueError):
            store.start("burpee")

    def test_squat_bottom_to_ready_counts_one_rep(self):
        store = LiveCoachSessionStore()
        session = store.start("squats", now=1.0)
        engine = LiveCoachEngine()

        engine.evaluate("squats", make_squat_pose(knee_angle=95.0), session, now=2.0)
        payload = engine.evaluate("squats", make_squat_pose(knee_angle=170.0), session, now=3.0)

        self.assertEqual(payload["phase"], "ready")
        self.assertEqual(payload["rep_count"], 1)

    def test_persistent_squat_error_speaks_after_threshold_and_respects_cooldown(self):
        store = LiveCoachSessionStore()
        session = store.start("squats", now=1.0)
        engine = LiveCoachEngine()
        pose = make_squat_pose(knee_angle=118.0, knee_span=70.0, ankle_span=180.0)

        first = engine.evaluate("squats", pose, session, now=2.0)
        second = engine.evaluate("squats", pose, session, now=3.0)
        third = engine.evaluate("squats", pose, session, now=4.0)
        fourth = engine.evaluate("squats", pose, session, now=9.5)

        self.assertEqual(first["speak_text"], "")
        self.assertIn("膝", second["speak_text"])
        self.assertEqual(third["speak_text"], "")
        self.assertIn("膝", fourth["speak_text"])

    def test_lunge_short_stride_triggers_stride_cue(self):
        store = LiveCoachSessionStore()
        session = store.start("lunges", now=1.0)
        engine = LiveCoachEngine()

        payload = engine.evaluate("lunges", make_lunge_pose(short_stride=True), session, now=2.0)

        self.assertEqual(payload["phase"], "bottom")
        self.assertIn("步", payload["primary_cue"])

    def test_pushup_sagging_body_triggers_body_line_cue(self):
        store = LiveCoachSessionStore()
        session = store.start("pushups", now=1.0)
        engine = LiveCoachEngine()

        payload = engine.evaluate("pushups", make_pushup_pose(sag=True), session, now=2.0)

        self.assertIn("一条线", payload["primary_cue"])

    def test_press_without_lockout_triggers_lockout_cue(self):
        store = LiveCoachSessionStore()
        session = store.start("dumbbell_shoulder_press", now=1.0)
        engine = LiveCoachEngine()

        payload = engine.evaluate("dumbbell_shoulder_press", make_press_pose(bad_lockout=True), session, now=2.0)

        self.assertEqual(payload["phase"], "rising")
        self.assertIn("伸直", payload["primary_cue"])

    def test_row_flared_elbows_trigger_row_cue(self):
        store = LiveCoachSessionStore()
        session = store.start("dumbbell_rows", now=1.0)
        engine = LiveCoachEngine()

        payload = engine.evaluate("dumbbell_rows", make_row_pose(elbows_flared=True), session, now=2.0)

        primary = payload["primary_cue"]
        self.assertTrue("手肘" in primary or "肋" in primary)

    def test_curl_elbow_drift_triggers_curl_cue(self):
        store = LiveCoachSessionStore()
        session = store.start("bicep_curls", now=1.0)
        engine = LiveCoachEngine()

        payload = engine.evaluate("bicep_curls", make_curl_pose(elbow_forward=True), session, now=2.0)

        self.assertIn("手肘", payload["primary_cue"])

    def test_generic_action_returns_generic_guidance(self):
        store = LiveCoachSessionStore()
        session = store.start("situps", now=1.0)
        engine = LiveCoachEngine()

        payload = engine.evaluate("situps", make_pushup_pose(), session, now=2.0)

        self.assertTrue("节奏" in payload["primary_cue"] or "稳定" in payload["primary_cue"])

    def test_stop_summary_reports_top_errors(self):
        store = LiveCoachSessionStore()
        session = store.start("squats", now=1.0)
        engine = LiveCoachEngine()
        pose = make_squat_pose(knee_angle=118.0, knee_span=70.0, ankle_span=180.0)

        engine.evaluate("squats", pose, session, now=2.0)
        engine.evaluate("squats", pose, session, now=3.0)
        summary = engine.build_summary(session, finished_at=6.0)

        self.assertEqual(summary["exercise"], "squats")
        self.assertGreaterEqual(summary["duration_seconds"], 5.0)
        self.assertTrue(summary["top_mistakes"])
        self.assertIn("膝", summary["top_mistakes"][0]["label"])


if __name__ == "__main__":
    unittest.main()
