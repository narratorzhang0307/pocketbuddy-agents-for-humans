import io
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

import numpy as np

from src.mmfit_dataset import MMFIT_COCO17_INDEXES, export_mmfit_pose_dataset, map_mmfit_pose_2d_to_coco17


def _build_pose_2d(frames=20):
    pose = np.zeros((2, frames, 19), dtype=np.float32)
    timestamps = np.arange(100, 100 + frames, dtype=np.float32)
    pose[0, :, 0] = timestamps
    pose[1, :, 0] = timestamps

    for joint in range(1, 19):
        pose[0, :, joint] = joint * 10 + np.arange(frames, dtype=np.float32)
        pose[1, :, joint] = joint * 100 + np.arange(frames, dtype=np.float32)
    return pose


def _write_zip(zip_path):
    pose = _build_pose_2d()
    buffer = io.BytesIO()
    np.save(buffer, pose)
    label_csv = "\n".join(
        [
            "104,111,8,squats",
            "114,119,6,pushups",
        ]
    )

    with zipfile.ZipFile(zip_path, "w") as zf:
        zf.writestr("mm-fit/w00/w00_pose_2d.npy", buffer.getvalue())
        zf.writestr("mm-fit/w00/w00_labels.csv", label_csv)


class MmfitDatasetTests(unittest.TestCase):
    def test_map_mmfit_pose_to_coco17_drops_timestamp_and_reorders_joints(self):
        pose = _build_pose_2d(frames=2)

        mapped = map_mmfit_pose_2d_to_coco17(pose)

        self.assertEqual(mapped.shape, (2, 2, 17))
        first_expected_openpose_joint = MMFIT_COCO17_INDEXES[0] + 1
        self.assertEqual(mapped[0, 0, 0], pose[0, 0, first_expected_openpose_joint])
        self.assertEqual(mapped[1, 1, 0], pose[1, 1, first_expected_openpose_joint])
        self.assertNotEqual(mapped[0, 0, 0], pose[0, 0, 0])

    def test_export_mmfit_pose_dataset_builds_windows_from_zip(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir_path = Path(tmpdir)
            zip_path = tmpdir_path / "mm-fit.zip"
            output_dir = tmpdir_path / "exported"
            _write_zip(zip_path)

            export_mmfit_pose_dataset(
                zip_path,
                output_dir,
                window_size=4,
                stride=4,
                include_other=True,
                seed=7,
            )

            keypoints = np.load(output_dir / "train_keypoints.npy")
            labels = np.load(output_dir / "train_labels.npy")
            label_map = json.loads((output_dir / "label_map.json").read_text(encoding="utf-8"))

            self.assertTrue((output_dir / "dataset_card.md").exists())
            self.assertEqual(keypoints.shape[1:], (2, 4, 17))
            self.assertEqual(keypoints.dtype, np.float32)
            self.assertEqual(labels.dtype, np.int64)
            self.assertIn("squats", label_map.values())
            self.assertIn("pushups", label_map.values())
            self.assertIn("other", label_map.values())
            self.assertGreaterEqual(len(np.unique(labels)), 3)


if __name__ == "__main__":
    unittest.main()
