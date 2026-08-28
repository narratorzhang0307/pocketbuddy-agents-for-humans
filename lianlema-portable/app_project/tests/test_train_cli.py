import tempfile
import unittest
from pathlib import Path

from src.fitness_dataset_bootstrap import build_bootstrap_dataset

from src import train


class TrainCliTests(unittest.TestCase):
    def test_build_train_config_overrides_defaults(self):
        config = train.build_train_config(
            epochs=3,
            batch_size=16,
            data_path="tools/train_keypoints.npy",
            label_path="tools/train_labels.npy",
            output_path="model/test_checkpoint.pth",
            device="cpu",
            num_classes=4,
        )
        self.assertEqual(config["epochs"], 3)
        self.assertEqual(config["batch_size"], 16)
        self.assertEqual(config["device"], "cpu")
        self.assertEqual(config["num_classes"], 4)

    def test_run_bounded_training_writes_four_class_checkpoint(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir_path = Path(tmpdir)
            keypoints, labels = build_bootstrap_dataset(samples_per_class=10, frames=32, seed=11)
            data_path = tmpdir_path / "train_keypoints.npy"
            label_path = tmpdir_path / "train_labels.npy"
            output_path = tmpdir_path / "fitness_action_4cls_mvp_best.pth"
            train.np.save(data_path, keypoints)
            train.np.save(label_path, labels)

            config = train.build_train_config(
                epochs=1,
                batch_size=8,
                data_path=str(data_path),
                label_path=str(label_path),
                output_path=str(output_path),
                device="cpu",
                num_classes=4,
            )

            result = train.run_bounded_training(config)

            self.assertTrue(Path(result).exists())


if __name__ == "__main__":
    unittest.main()
