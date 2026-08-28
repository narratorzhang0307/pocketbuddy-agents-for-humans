import unittest

import numpy as np

from src.fitness_infer import FITNESS_LABELS, FitnessActionRecognizer


class FakeModel:
    def __init__(self, label=0, confidence=0.93):
        self.label = label
        self.confidence = confidence

    def predict(self, sequence):
        return np.array([[self.label]]), np.array([[self.confidence]])


class FitnessInferTests(unittest.TestCase):
    def test_default_label_map_contains_mmfit_11_classes(self):
        expected = {
            0: "other",
            1: "squats",
            2: "lunges",
            3: "pushups",
            4: "dumbbell_shoulder_press",
            5: "dumbbell_rows",
            6: "situps",
            7: "tricep_extensions",
            8: "bicep_curls",
            9: "lateral_shoulder_raises",
            10: "jumping_jacks",
        }
        self.assertEqual(FITNESS_LABELS, expected)

    def test_predict_returns_label_and_confidence(self):
        recognizer = FitnessActionRecognizer(model=FakeModel(label=5), window_size=16)
        sequence = np.zeros((2, 16, 17), dtype=np.float32)

        result = recognizer.predict_window(sequence)

        self.assertEqual(result["action"], "dumbbell_rows")
        self.assertEqual(result["label"], 5)
        self.assertAlmostEqual(result["confidence"], 0.93, places=2)
        self.assertEqual(FITNESS_LABELS[5], "dumbbell_rows")

    def test_accumulate_requires_full_window(self):
        recognizer = FitnessActionRecognizer(model=FakeModel(label=8), window_size=4)
        frame = np.zeros((17, 2), dtype=np.float32)

        self.assertIsNone(recognizer.push_frame(frame))
        self.assertIsNone(recognizer.push_frame(frame))
        self.assertIsNone(recognizer.push_frame(frame))

        result = recognizer.push_frame(frame)
        self.assertEqual(result["action"], "bicep_curls")


if __name__ == "__main__":
    unittest.main()
