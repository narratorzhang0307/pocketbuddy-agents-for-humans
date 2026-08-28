# -*- coding: utf-8 -*-
"""Qwen 定位 -> 冻结 SAM -> 结果门控的最小 Harness。"""
from dataclasses import dataclass

from grounding import area_ratio, bbox_iou, denormalize_bbox, denormalize_point, parse_grounding_json


@dataclass(frozen=True)
class HarnessConfig:
    min_area_ratio: float = 0.002
    max_area_ratio: float = 0.90
    duplicate_iou: float = 0.85
    max_regions: int = 12
    # Prompted-SAM smoke evidence put reliable masks at roughly >=0.80;
    # lower scores should be reviewed instead of silently accepted.
    min_sam_score: float = 0.80
    max_auto_candidates: int = 30
    enable_prompt_retry: bool = False
    # Retry masks must be plausible for the original Qwen prompt box.  This
    # blocks high-scoring one-fragment masks and masks that spill into neighbours.
    retry_min_prompt_coverage: float = 0.20
    retry_max_prompt_coverage: float = 1.20
    retry_min_prompt_containment: float = 0.85


def retry_candidate_is_safe(candidate, config=HarnessConfig()):
    """Gate a retry by score plus geometric completeness/containment evidence."""
    return (
        float(candidate.get("score", 0.0)) >= config.min_sam_score
        and bool(candidate.get("contains_positive_point", False))
        and config.retry_min_prompt_coverage
        <= float(candidate.get("prompt_coverage", -1.0))
        <= config.retry_max_prompt_coverage
        and float(candidate.get("prompt_containment", -1.0))
        >= config.retry_min_prompt_containment
    )


def filter_grounding_items(items, config=HarnessConfig()):
    """确定性过滤：异常面积、重复框、候选数量上限。"""
    kept = []
    ordered = sorted(items, key=lambda item: float(item.get("confidence", 1.0)), reverse=True)
    for item in ordered:
        ratio = area_ratio(item["bbox_norm"])
        if not config.min_area_ratio <= ratio <= config.max_area_ratio:
            continue
        if any(bbox_iou(item["bbox_norm"], other["bbox_norm"]) >= config.duplicate_iou
               for other in kept):
            continue
        kept.append(item)
        if len(kept) >= config.max_regions:
            break
    return kept


def run_harness(image, grounding_output, segmenter, verifier=None, candidate_generator=None,
                config=HarnessConfig()):
    """运行单张图片；segmenter 接收 image,bbox,point 并返回 score/mask_uri。"""
    grounding = parse_grounding_json(grounding_output)
    width, height = image.size
    items = filter_grounding_items(grounding["items"], config)
    prepared = []
    for index, item in enumerate(items, 1):
        prepared.append({
            "item": item,
            "region_id": item.get("region_id") or f"r{index:03d}",
            "bbox": denormalize_bbox(item["bbox_norm"], width, height),
            "point": denormalize_point(item["positive_point_norm"], width, height),
        })
    regions = []
    rejected = []
    for prepared_item in prepared:
        item = prepared_item["item"]
        region_id = prepared_item["region_id"]
        bbox = prepared_item["bbox"]
        point = prepared_item["point"]
        result = segmenter(image=image, bbox_xyxy=bbox, positive_point_xy=point,
                           region_id=region_id)
        score = float(result.get("score", 0.0))
        initial_score = score
        retry_attempts = []
        if (score < config.min_sam_score and config.enable_prompt_retry
                and callable(getattr(segmenter, "retry", None))):
            x1, y1, x2, y2 = bbox
            negative_points = [
                row["point"] for row in prepared
                if row is not prepared_item
                and x1 <= row["point"][0] <= x2
                and y1 <= row["point"][1] <= y2
            ]
            retry_attempts = segmenter.retry(
                image=image,
                bbox_xyxy=bbox,
                positive_point_xy=point,
                negative_points_xy=negative_points,
                region_id=region_id,
            )
            safe_attempts = [
                candidate for candidate in retry_attempts
                if retry_candidate_is_safe(candidate, config)
            ]
            if safe_attempts:
                result = max(safe_attempts, key=lambda candidate: float(candidate["score"]))
                score = float(result["score"])
        if score < config.min_sam_score:
            rejection = {"item": item, "reason": "sam_score_low", "score": initial_score}
            if retry_attempts:
                rejection["retry_best_score"] = max(
                    float(candidate.get("score", 0.0)) for candidate in retry_attempts)
                rejection["retry_attempts"] = retry_attempts
            rejected.append(rejection)
            continue
        region = {
            "region_id": region_id,
            "category": item.get("category", "food_region"),
            "bbox_xyxy": bbox,
            "positive_point_xy": point,
            "sam_score": score,
            "mask_uri": result.get("mask_uri"),
            "grounding_confidence": item.get("confidence"),
            "source": "qwen_grounded",
            "retry_used": bool(retry_attempts),
            "prompt_strategy": result.get("strategy", "original"),
        }
        if retry_attempts:
            region["initial_sam_score"] = initial_score
        for key in ("prompt_coverage", "prompt_containment", "contains_positive_point"):
            if key in result:
                region[key] = result[key]
        if verifier:
            decision = verifier(image=image, region=region)
            if not decision.get("is_food", False):
                rejected.append({"item": item, "reason": "verifier_non_food",
                                 "verifier": decision})
                continue
            region["verification"] = decision
        regions.append(region)
    expected = grounding.get("expected_count", len(grounding["items"]))
    # 只在数量不足时启用 SAM 自动候选；必须经过语义验证器，避免把盘子当菜。
    if len(regions) < expected and candidate_generator and verifier:
        candidates = candidate_generator(image=image)[:config.max_auto_candidates]
        for index, candidate in enumerate(candidates, 1):
            bbox = candidate.get("bbox_xyxy")
            score = float(candidate.get("score", 0.0))
            if not bbox or score < config.min_sam_score:
                continue
            if any(bbox_iou(bbox, region["bbox_xyxy"]) >= config.duplicate_iou
                   for region in regions):
                continue
            region = {
                "region_id": f"auto_{index:03d}",
                "category": "food_candidate",
                "bbox_xyxy": bbox,
                "positive_point_xy": candidate.get("positive_point_xy"),
                "sam_score": score,
                "mask_uri": candidate.get("mask_uri"),
                "grounding_confidence": None,
                "source": "sam_auto_candidate",
            }
            decision = verifier(image=image, region=region)
            if not decision.get("is_food", False):
                rejected.append({"item": region, "reason": "auto_candidate_non_food",
                                 "verifier": decision})
                continue
            region["category"] = decision.get("category") or region["category"]
            region["verification"] = decision
            regions.append(region)
            if len(regions) >= expected:
                break
    return {
        "scene_type": grounding.get("scene_type"),
        "expected_count": expected,
        "regions": regions,
        "rejected": rejected,
        "requires_confirmation": len(regions) != expected,
        "status": "needs_review" if len(regions) != expected else "ok",
    }
