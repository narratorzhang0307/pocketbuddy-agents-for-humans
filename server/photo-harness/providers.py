# -*- coding: utf-8 -*-
"""Frozen SAM 2.1 inference adapter recovered from the SSD v11 Harness."""
import os


class FrozenSam2Segmenter:
    def __init__(self, model_cfg, checkpoint, output_dir, device="auto"):
        import torch
        from sam2.build_sam import build_sam2
        from sam2.sam2_image_predictor import SAM2ImagePredictor
        self.np = __import__("numpy")
        self.Image = __import__("PIL.Image", fromlist=["Image"])
        self.torch = torch
        if device == "auto":
            device = ("cuda" if torch.cuda.is_available() else
                      "mps" if torch.backends.mps.is_available() else "cpu")
        self.device = device
        model = build_sam2(model_cfg, checkpoint, device=device)
        model.eval()
        for parameter in model.parameters():
            parameter.requires_grad_(False)
        self.model = model
        self.predictor = SAM2ImagePredictor(model)
        self.output_dir = output_dir
        self._image_key = None
        os.makedirs(output_dir, exist_ok=True)

    def _ensure_image(self, image):
        # 同一张图的多个区域共用 SAM 图像特征，避免重复编码。
        image_key = id(image)
        if image_key != self._image_key:
            self.predictor.set_image(self.np.asarray(image.convert("RGB")).copy())
            self._image_key = image_key

    def _predict(self, bbox_xyxy, positive_point_xy, negative_points_xy=(),
                 mask_input=None, multimask_output=True):
        points = [positive_point_xy] + list(negative_points_xy)
        labels = [1] + [0] * len(negative_points_xy)
        with self.torch.no_grad():
            masks, scores, logits = self.predictor.predict(
                point_coords=self.np.asarray(points, dtype=self.np.float32),
                point_labels=self.np.asarray(labels, dtype=self.np.int32),
                box=(None if bbox_xyxy is None else
                     self.np.asarray(bbox_xyxy, dtype=self.np.float32)),
                mask_input=mask_input,
                multimask_output=multimask_output,
            )
        best = int(self.np.argmax(scores))
        mask = (masks[best] > 0).astype("uint8") * 255
        return mask, float(scores[best]), logits[best:best + 1]

    def _save_mask(self, mask, filename):
        path = os.path.join(self.output_dir, filename)
        self.Image.fromarray(mask).save(path)
        return os.path.abspath(path)

    def _mask_metrics(self, mask, prompt_bbox, positive_point):
        foreground = mask > 0
        height, width = foreground.shape
        x1, y1, x2, y2 = [float(value) for value in prompt_bbox]
        ix1 = max(0, min(width, int(self.np.floor(x1))))
        iy1 = max(0, min(height, int(self.np.floor(y1))))
        ix2 = max(ix1, min(width, int(self.np.ceil(x2))))
        iy2 = max(iy1, min(height, int(self.np.ceil(y2))))
        mask_area = int(foreground.sum())
        inside_area = int(foreground[iy1:iy2, ix1:ix2].sum())
        prompt_area = max(1, (ix2 - ix1) * (iy2 - iy1))
        px = max(0, min(width - 1, int(round(positive_point[0]))))
        py = max(0, min(height - 1, int(round(positive_point[1]))))
        return {
            "prompt_coverage": float(mask_area / prompt_area),
            "prompt_containment": float(inside_area / max(1, mask_area)),
            "contains_positive_point": bool(foreground[py, px]),
        }

    @staticmethod
    def _tighten_box(box, point, fraction):
        x1, y1, x2, y2 = [float(value) for value in box]
        px, py = [float(value) for value in point]
        return [
            x1 + (px - x1) * fraction,
            y1 + (py - y1) * fraction,
            x2 - (x2 - px) * fraction,
            y2 - (y2 - py) * fraction,
        ]

    @staticmethod
    def _expand_box(box, image, fraction):
        x1, y1, x2, y2 = [float(value) for value in box]
        dx = (x2 - x1) * fraction
        dy = (y2 - y1) * fraction
        return [max(0.0, x1 - dx), max(0.0, y1 - dy),
                min(float(image.width), x2 + dx), min(float(image.height), y2 + dy)]

    def __call__(self, image, bbox_xyxy, positive_point_xy, region_id):
        self._ensure_image(image)
        mask, score, _ = self._predict(bbox_xyxy, positive_point_xy)
        result = {
            "score": score,
            "mask_uri": self._save_mask(mask, f"{region_id}.png"),
        }
        result.update(self._mask_metrics(mask, bbox_xyxy, positive_point_xy))
        return result

    def retry(self, image, bbox_xyxy, positive_point_xy, negative_points_xy, region_id):
        """Try conservative prompt variants; Harness applies the final safety gate."""
        self._ensure_image(image)
        strategies = [("original", bbox_xyxy, [])]
        if negative_points_xy:
            strategies.append(("negative_points", bbox_xyxy, negative_points_xy))
        for fraction in (0.08, 0.16):
            strategies.append((
                f"expand_{fraction:.2f}",
                self._expand_box(bbox_xyxy, image, fraction),
                [],
            ))
        for fraction in (0.12, 0.22):
            tightened = self._tighten_box(bbox_xyxy, positive_point_xy, fraction)
            strategies.append((f"tight_{fraction:.2f}", tightened, []))
            if negative_points_xy:
                strategies.append((
                    f"tight_{fraction:.2f}_negative", tightened, negative_points_xy))

        candidates = []
        for strategy, prompt_box, negatives in strategies:
            mask, score, logits = self._predict(
                prompt_box, positive_point_xy, negatives)
            candidate = {
                "strategy": strategy,
                "score": score,
                "mask_uri": self._save_mask(mask, f"{region_id}__{strategy}.png"),
            }
            candidate.update(self._mask_metrics(mask, bbox_xyxy, positive_point_xy))
            candidates.append(candidate)

            refined_mask, refined_score, _ = self._predict(
                prompt_box, positive_point_xy, negatives,
                mask_input=logits, multimask_output=False)
            refined_strategy = strategy + "_refined"
            refined = {
                "strategy": refined_strategy,
                "score": refined_score,
                "mask_uri": self._save_mask(
                    refined_mask, f"{region_id}__{refined_strategy}.png"),
            }
            refined.update(self._mask_metrics(
                refined_mask, bbox_xyxy, positive_point_xy))
            candidates.append(refined)
        return candidates

    def automatic_candidates(self, image):
        """仅在 Qwen 定位数量不足时调用，结果必须再经语义验证。"""
        from sam2.automatic_mask_generator import SAM2AutomaticMaskGenerator
        generator = SAM2AutomaticMaskGenerator(
            self.model, points_per_side=16, pred_iou_thresh=0.75,
            stability_score_thresh=0.85, min_mask_region_area=100,
        )
        with self.torch.no_grad():
            proposals = generator.generate(self.np.asarray(image.convert("RGB")))
        result = []
        for index, proposal in enumerate(sorted(
                proposals, key=lambda row: float(row.get("predicted_iou", 0.0)), reverse=True), 1):
            x, y, width, height = proposal["bbox"]
            mask = proposal["segmentation"].astype("uint8") * 255
            path = os.path.join(self.output_dir, f"auto_{index:03d}.png")
            self.Image.fromarray(mask).save(path)
            result.append({
                "bbox_xyxy": [int(x), int(y), int(x + width), int(y + height)],
                "positive_point_xy": [int(x + width / 2), int(y + height / 2)],
                "score": float(proposal.get("predicted_iou", 0.0)),
                "mask_uri": os.path.abspath(path),
            })
        return result
