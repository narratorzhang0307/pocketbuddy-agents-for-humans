# MM-Fit Retrain Summary

## Dataset Detection

- Source bundle: `datas/mm-fit.zip` (merged from `mm-fit.zip.part-00` and `mm-fit.zip.part-01`)
- Subject count: `21`
- Raw files per subject:
  - `*_pose_2d.npy`
  - `*_pose_3d.npy`
  - `*_labels.csv`
  - wearable sensor `.npy` files

## Key Findings

- `pose_2d.npy` shape is `(2, T, 19)`.
- The first column is a timestamp/frame index, not a body joint.
- After dropping the timestamp, MM-Fit provides `18` body joints.
- The export pipeline maps those `18` joints into the repo's `17`-joint COCO-style layout so the trained weights stay compatible with the current webcam pose format.

## Expanded Action Taxonomy

The exported real dataset now supports `11` classes:

1. `other`
2. `squats`
3. `lunges`
4. `pushups`
5. `dumbbell_shoulder_press`
6. `dumbbell_rows`
7. `situps`
8. `tricep_extensions`
9. `bicep_curls`
10. `lateral_shoulder_raises`
11. `jumping_jacks`

Compared with the previous 4-class demo recognizer, this adds:

- `dumbbell_rows`
- `situps`
- `tricep_extensions`
- `bicep_curls`
- `lateral_shoulder_raises`
- `jumping_jacks`

## Exported Training Set

Recommended lighter real-data export:

- Path: `tools/mmfit_pose_11cls_stride48`
- Shape: `(8898, 2, 48, 17)`
- Window size: `48`
- Stride: `48`

## New Weight

- Path: `model/mmfit_pose11cls_stride48_best.pth`
- Training command:

```powershell
.\.venv\Scripts\python.exe src\train.py `
  --epochs 5 `
  --batch-size 128 `
  --data-path tools\mmfit_pose_11cls_stride48\train_keypoints.npy `
  --label-path tools\mmfit_pose_11cls_stride48\train_labels.npy `
  --output-path model\mmfit_pose11cls_stride48_best.pth `
  --num-classes 11 `
  --device cpu
```

## Latest Training Result

- Epoch 1/5: Train `45.83%`, Val `47.75%`
- Epoch 2/5: Train `70.78%`, Val `73.37%`
- Epoch 3/5: Train `83.49%`, Val `84.72%`
- Epoch 4/5: Train `88.74%`, Val `86.18%`
- Epoch 5/5: Train `89.46%`, Val `93.15%`

## Scope Note

This new weight expands action recognition classes.

The current live correction engine still only has correction rules for:

- `squat`
- `lunge`
- `pushup`
- `press`

So the richer 11-class model is ready for recognition expansion, but the extra 6 actions still need dedicated correction logic before they can produce exercise-specific coaching cues in the live demo.
