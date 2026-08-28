#!/usr/bin/env python3
"""Center complete exhibit captures without changing the preserved sources."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sequence", type=Path, required=True)
    parser.add_argument("--object-id", required=True)
    parser.add_argument("--alpha-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--size", type=int, default=1600)
    parser.add_argument("--padding-ratio", type=float, default=0.12)
    return parser.parse_args()


def load_sequence(path: Path, object_id: str) -> dict:
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            row = json.loads(line)
            if row.get("object_id") == object_id:
                return row
    raise ValueError(f"object {object_id} not found in {path}")


def main() -> None:
    args = parse_args()
    if not 0.05 <= args.padding_ratio <= 0.25:
        raise ValueError("padding-ratio must be between 0.05 and 0.25")

    sequence = load_sequence(args.sequence, args.object_id)
    views = sorted(sequence["views"], key=lambda item: float(item["yaw_degrees"]))
    args.output.mkdir(parents=True, exist_ok=True)
    normalized_views = []
    audit_views = []

    for index, view in enumerate(views):
        source_path = Path(view["path"]).resolve()
        yaw = round(float(view["yaw_degrees"]))
        view_stem = f"view-{index:02d}-{yaw:03d}"
        alpha_path = args.alpha_dir / f"{view_stem}.png"
        if not alpha_path.is_file():
            alpha_path = args.alpha_dir / f"{view_stem}-alpha.png"
        source = Image.open(source_path).convert("RGB")
        alpha = Image.open(alpha_path).convert("L").resize(source.size, Image.Resampling.LANCZOS)
        mask = np.asarray(alpha, dtype=np.uint8) >= 24
        ys, xs = np.where(mask)
        if not xs.size:
            raise ValueError(f"no foreground found for {source_path.name}")

        left, top, right, bottom = int(xs.min()), int(ys.min()), int(xs.max() + 1), int(ys.max() + 1)
        subject_size = max(right - left, bottom - top)
        padding = max(12, round(subject_size * args.padding_ratio))
        crop_box = (
            max(0, left - padding),
            max(0, top - padding),
            min(source.width, right + padding),
            min(source.height, bottom + padding),
        )
        crop = source.crop(crop_box)
        corners = np.asarray([
            crop.getpixel((0, 0)),
            crop.getpixel((crop.width - 1, 0)),
            crop.getpixel((0, crop.height - 1)),
            crop.getpixel((crop.width - 1, crop.height - 1)),
        ], dtype=np.uint8)
        fill = tuple(int(value) for value in np.median(corners, axis=0))
        square_size = max(crop.size)
        left_pad = (square_size - crop.width) // 2
        top_pad = (square_size - crop.height) // 2
        square = ImageOps.expand(
            crop,
            border=(left_pad, top_pad, square_size - crop.width - left_pad, square_size - crop.height - top_pad),
            fill=fill,
        ).resize((args.size, args.size), Image.Resampling.LANCZOS)
        output_path = args.output / f"{view_stem}.jpg"
        square.save(output_path, format="JPEG", quality=94, optimize=True, subsampling=0)

        normalized_views.append({"path": str(output_path.resolve()), "yaw_degrees": yaw})
        audit_views.append({
            "id": view_stem,
            "source": str(source_path),
            "source_sha256": sha256(source_path),
            "source_size": list(source.size),
            "subject_bbox": [left, top, right, bottom],
            "crop_box": list(crop_box),
            "normalized": str(output_path.resolve()),
            "normalized_sha256": sha256(output_path),
            "normalized_size": [args.size, args.size],
            "subject_complete": True,
        })

    normalized_sequence = {**sequence, "views": normalized_views}
    (args.output / "sequence.jsonl").write_text(
        json.dumps(normalized_sequence, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    (args.output / "capture-normalization.json").write_text(
        json.dumps({
            "schema": "pocketearth.exhibit-capture-normalization/v1",
            "method": "first-pass MNN support bbox; immutable source; centered square RGB",
            "padding_ratio": args.padding_ratio,
            "views": audit_views,
        }, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
