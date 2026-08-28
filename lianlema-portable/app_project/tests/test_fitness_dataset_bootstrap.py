import tempfile
import unittest
from pathlib import Path

import numpy as np

from src.fitness_dataset_bootstrap import (
    ACTION_LABELS,
    build_bootstrap_dataset,
    export_bootstrap_dataset,
)


class FitnessDatasetBootstrapTests(unittest.TestCase):
    def test_build_bootstrap_dataset_returns_four_class_sequences(self):
        keypoints, labels = build_bootstrap_dataset(samples_per_class=8, frames=48, seed=7)

        self.assertEqual(keypoints.shape, (32, 2, 48, 17))
        self.assertEqual(labels.shape, (32,))
        self.assertEqual(keypoints.dtype, np.float32)
        self.assertEqual(labels.dtype, np.int64)
        self.assertEqual(sorted(np.unique(labels).tolist()), [0, 1, 2, 3])
        self.assertEqual(ACTION_LABELS[0], "squat")
        self.assertEqual(ACTION_LABELS[3], "press")

    def test_export_bootstrap_dataset_writes_bundle(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            output_dir = Path(tmpdir)
            export_bootstrap_dataset(output_dir, samples_per_class=4, frames=32, seed=3)

            self.assertTrue((output_dir / "train_keypoints.npy").exists())
            self.assertTrue((output_dir / "train_labels.npy").exists())
            self.assertTrue((output_dir / "label_map.json").exists())
            self.assertTrue((output_dir / "dataset_card.md").exists())


if __name__ == "__main__":
    unittest.main()
