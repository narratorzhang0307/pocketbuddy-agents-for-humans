"""Integration tests use synthetic coordinates only; they do not measure sports accuracy."""
import copy
import hashlib
import importlib.util
import json
import re
import unittest
from pathlib import Path
from unittest.mock import patch
import numpy as np
from assess import assess, CATALOG, load_engine, ROOT
from english import FEEDBACK, localize_assessment

spec = importlib.util.spec_from_file_location("badminton_fixtures", ROOT / "01_badminton/tests/test_rules_math.py")
fixtures = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixtures)


def request(sport="badminton", action=1):
    return dict(sport=sport, action=action, width=720, height=720,
                frames=fixtures._standing().tolist(), timestamps=[i * 50 for i in range(30)])


class AdapterTests(unittest.TestCase):
    def test_imported_sources_keep_their_original_hashes(self):
        manifest = json.loads((ROOT / "source-manifest.json").read_text())
        for name, sha in manifest["sha256"].items():
            self.assertEqual(hashlib.sha256((ROOT / name).read_bytes()).hexdigest(), sha)

    def test_every_action_uses_its_own_rule_engine_and_is_json_serializable(self):
        for sport in CATALOG:
            engine, rules, _ = load_engine(sport)
            self.assertEqual(engine.__class__.__module__, sport["package"] + ".biomech.rules")
            for action in sport["actions"]:
                with self.subTest(sport=sport["id"], action=action["id"]):
                    value = assess(request(sport["id"], action["id"]))
                    self.assertEqual((value["sport"], value["cls_name"]), (sport["id"], action["name"]))
                    self.assertFalse(value["trained_classifier"])
                    self.assertEqual(value["action_source"], "user-selected")
                    self.assertTrue(all(0 <= j < 17 for j in value["affected_joints"]))
                    self.assertTrue(all(e["code"] in rules.CLASS_ERRORS[action["sourceName"]] for e in value["errors"]))
                    self.assertFalse(re.search(r"[\u3400-\u9fff]", json.dumps(value, ensure_ascii=False, allow_nan=False)))
                    self.assertEqual(rules.CLASS_NAMES[action["id"]], action["sourceName"])

    def test_invalid_input_cannot_enter_a_rule_engine(self):
        variants = [dict(sport="../01_badminton"), dict(action=True), dict(action=99), dict(action=0),
                    dict(frames=[]), dict(width=0), dict(height=None), dict(timestamps=[0] * 30),
                    dict(timestamps=[i * 251 for i in range(30)]), dict(timestamps=[i * 10 for i in range(30)])]
        for changed in variants:
            with self.subTest(changed=changed), patch("assess.load_engine") as engine:
                with self.assertRaises((ValueError, TypeError)):
                    assess(dict(request(), **changed))
                engine.assert_not_called()
        bad = request(); bad["frames"][0][0][0] = float("nan")
        with self.assertRaises(ValueError): assess(bad)

    def test_even_one_obscured_or_offscreen_required_joint_stops_scoring(self):
        for joint in [0, 5, 9, 11, 13, 16]:
            for component, value in [(2, .3), (0, 1.1)]:
                bad = request(); bad["frames"][15][joint][component] = value
                with patch("assess.load_engine") as engine:
                    result = assess(bad)
                    self.assertFalse(result["valid"])
                    self.assertIsNone(result["score"])
                    self.assertEqual(result["affected_joints"], [])
                    engine.assert_not_called()

    def test_corrects_image_aspect_ratio_without_changing_the_geometry(self):
        square = request(); wide = copy.deepcopy(square); wide["width"] = 1440
        for frame in wide["frames"]:
            for point in frame: point[0] /= 2
        self.assertEqual(assess(square), assess(wide))
        self.assertEqual(square, request())

    def test_actual_frame_times_are_used_and_irregular_samples_are_resampled(self):
        payload = request(); payload["timestamps"] = [i * 50 + (i % 2) * 10 for i in range(30)]
        engine, rules, coach = load_engine(CATALOG[0])
        with patch.object(engine, "assess", wraps=engine.assess) as run:
            with patch("assess.load_engine", return_value=(engine, rules, coach)):
                assess(payload)
            self.assertAlmostEqual(run.call_args.kwargs["fps"], 1000 * 29 / 1460)
            self.assertTrue(np.isfinite(run.call_args.args[0]).all())

    def test_coordinate_changes_produce_real_rule_feedback(self):
        good = request(); bad = request()
        good["frames"] = fixtures._add_swing(fixtures._standing(), (.70, .13),
            [(.55, .52), (.58, .46), (.62, .38), (.66, .28)], [(.73, .17), (.75, .19)]).tolist()
        bad["frames"] = fixtures._add_swing(fixtures._standing(), (.66, .46),
            [(.55, .52), (.58, .50), (.62, .48)], [(.70, .46), (.72, .47)]).tolist()
        good_result, bad_result = assess(good), assess(bad)
        self.assertGreater(good_result["score"], bad_result["score"])
        self.assertIn("E01", [e["code"] for e in bad_result["errors"]])
        self.assertTrue(bad_result["affected_joints"])
        self.assertTrue(bad_result["correction"])

    def test_static_stance_is_not_counted_as_jump_rope(self):
        value = assess(request("jumprope"))
        self.assertFalse(value["valid"])
        self.assertIsNone(value["score"])
        self.assertEqual(value["n_hops"], 0)

    def test_every_original_error_has_english_labels_and_cues(self):
        for sport in CATALOG:
            _, rules, _ = load_engine(sport)
            self.assertEqual(set(FEEDBACK[sport["id"]]), set(rules.ERROR_CODES))
            for code in rules.ERROR_CODES:
                result = rules.Assessment(1, rules.CLASS_NAMES[1], score=92,
                    errors=[rules.ErrorItem(code, "中", 1.0, 1.0, 1.0)])
                translated = localize_assessment(sport, result)
                self.assertEqual(translated["score"], 92)
                self.assertEqual(translated["errors"][0]["severity"], "moderate")
                self.assertTrue(translated["correction"])
                self.assertFalse(re.search(r"[\u3400-\u9fff]", json.dumps(translated, ensure_ascii=False)))

    def test_health_reports_the_selected_action_boundary(self):
        self.assertEqual(assess({"check": True}), dict(protocol="pocket-sports-pose/v1", ready=True,
                         mode="selected-action-rules", trained_classifier=False))


if __name__ == "__main__": unittest.main()
