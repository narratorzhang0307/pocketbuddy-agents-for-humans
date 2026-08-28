# -*- coding: utf-8 -*-
"""食物区域定位的统一坐标、COCO 派生提示和评测工具。"""
import json
import math


COORD_MAX = 1000


def clamp(value, low=0.0, high=COORD_MAX):
    return max(low, min(high, float(value)))


def normalize_bbox_xywh(bbox, width, height):
    """COCO [x,y,w,h] -> 归一化 [x1,y1,x2,y2]（0..1000）。"""
    x, y, w, h = [float(v) for v in bbox]
    if width <= 0 or height <= 0 or w <= 0 or h <= 0:
        raise ValueError("invalid bbox or image size")
    return [
        round(clamp(x / width * COORD_MAX), 2),
        round(clamp(y / height * COORD_MAX), 2),
        round(clamp((x + w) / width * COORD_MAX), 2),
        round(clamp((y + h) / height * COORD_MAX), 2),
    ]


def normalize_point(point, width, height):
    x, y = point
    if width <= 0 or height <= 0:
        raise ValueError("invalid image size")
    return [
        round(clamp(float(x) / width * COORD_MAX), 2),
        round(clamp(float(y) / height * COORD_MAX), 2),
    ]


def denormalize_bbox(bbox, width, height):
    x1, y1, x2, y2 = [float(v) for v in bbox]
    return [
        int(round(clamp(x1) / COORD_MAX * width)),
        int(round(clamp(y1) / COORD_MAX * height)),
        int(round(clamp(x2) / COORD_MAX * width)),
        int(round(clamp(y2) / COORD_MAX * height)),
    ]


def denormalize_point(point, width, height):
    x, y = [float(v) for v in point]
    return [
        int(round(clamp(x) / COORD_MAX * width)),
        int(round(clamp(y) / COORD_MAX * height)),
    ]


def _decode_segmentation(segmentation, width, height):
    """返回 uint8 mask；polygon 无额外依赖，RLE 需要 pycocotools。"""
    import numpy as np
    from PIL import Image, ImageDraw

    if isinstance(segmentation, list):
        image = Image.new("L", (width, height), 0)
        draw = ImageDraw.Draw(image)
        for polygon in segmentation:
            if not isinstance(polygon, list) or len(polygon) < 6:
                continue
            points = list(zip(polygon[0::2], polygon[1::2]))
            draw.polygon(points, outline=1, fill=1)
        return np.asarray(image, dtype=np.uint8)
    if isinstance(segmentation, dict):
        try:
            from pycocotools import mask as mask_utils
        except ImportError as exc:
            raise RuntimeError("RLE segmentation requires pycocotools") from exc
        decoded = mask_utils.decode(segmentation)
        if decoded.ndim == 3:
            decoded = decoded.any(axis=2)
        return decoded.astype(np.uint8)
    raise ValueError("unsupported segmentation")


def safe_positive_point(segmentation, bbox, width, height):
    """从 mask 内部选择靠近前景质心的点；失败时回退 bbox 中心。"""
    x, y, w, h = [float(v) for v in bbox]
    fallback = [x + w / 2.0, y + h / 2.0]
    if not segmentation:
        return fallback
    try:
        import numpy as np
        mask = _decode_segmentation(segmentation, width, height)
        pixels = np.argwhere(mask > 0)
        if pixels.size == 0:
            return fallback
        center = pixels.mean(axis=0)
        index = int(np.argmin(((pixels - center) ** 2).sum(axis=1)))
        py, px = pixels[index]
        return [float(px), float(py)]
    except (ValueError, RuntimeError, ImportError):
        return fallback


def annotation_to_prompt(annotation, image, category_name="food_region", region_index=1):
    width, height = int(image["width"]), int(image["height"])
    bbox = annotation["bbox"]
    point = annotation.get("positive_point")
    if point is None:
        point = safe_positive_point(annotation.get("segmentation"), bbox, width, height)
    return {
        "region_id": f"r{region_index:03d}",
        "category": category_name,
        "bbox_norm": normalize_bbox_xywh(bbox, width, height),
        "positive_point_norm": normalize_point(point, width, height),
    }


def parse_grounding_json(value):
    if isinstance(value, str):
        value = value.strip()
        if value.startswith("```"):
            value = value.split("\n", 1)[1].rsplit("```", 1)[0]
        value = json.loads(value)
    reason = validate_grounding(value)
    if reason:
        raise ValueError(reason)
    return value


def validate_grounding(value):
    if not isinstance(value, dict):
        return "grounding_not_object"
    items = value.get("items")
    if not isinstance(items, list) or len(items) > 12:
        return "items_not_list"
    for item in items:
        if not isinstance(item, dict):
            return "item_not_object"
        bbox = item.get("bbox_norm")
        point = item.get("positive_point_norm")
        if not isinstance(bbox, list) or len(bbox) != 4:
            return "invalid_bbox"
        if not all(type(v) in (int, float) and math.isfinite(v) and 0 <= v <= COORD_MAX for v in bbox):
            return "bbox_out_of_range"
        if bbox[2] <= bbox[0] or bbox[3] <= bbox[1]:
            return "invalid_bbox_order"
        if not isinstance(point, list) or len(point) != 2:
            return "invalid_positive_point"
        if not all(type(v) in (int, float) and math.isfinite(v) and 0 <= v <= COORD_MAX for v in point):
            return "point_out_of_range"
        if not point_in_bbox(point, bbox):
            return "point_outside_bbox"
        if not isinstance(item.get("category"), str) or not 1 <= len(item["category"].strip()) <= 80:
            return "invalid_category"
        confidence = item.get("confidence", 1.0)
        if type(confidence) not in (int, float) or not math.isfinite(confidence) or not 0 <= confidence <= 1:
            return "invalid_confidence"
    expected = value.get("expected_count")
    if expected is not None and (type(expected) is not int or not 0 <= expected <= 64):
        return "invalid_expected_count"
    return None


def bbox_iou(a, b):
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    iw = max(0.0, min(ax2, bx2) - max(ax1, bx1))
    ih = max(0.0, min(ay2, by2) - max(ay1, by1))
    inter = iw * ih
    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = area_a + area_b - inter
    return inter / union if union else 0.0


def point_in_bbox(point, bbox):
    return bbox[0] <= point[0] <= bbox[2] and bbox[1] <= point[1] <= bbox[3]


def area_ratio(bbox):
    return max(0.0, bbox[2] - bbox[0]) * max(0.0, bbox[3] - bbox[1]) / (COORD_MAX ** 2)


def center_distance(a, b):
    ac = ((a[0] + a[2]) / 2, (a[1] + a[3]) / 2)
    bc = ((b[0] + b[2]) / 2, (b[1] + b[3]) / 2)
    return math.hypot(ac[0] - bc[0], ac[1] - bc[1])
