#!/usr/bin/env python3
"""Fetch licensed book photos and render deterministic UI-stroke previews."""

from __future__ import annotations

import io
import json
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
FIXTURE_DIR = ROOT / "tests/fixtures/reading-jot/real-world"
MANIFEST = FIXTURE_DIR / "cases.json"
MAX_SIDE = 1920


def download(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "PocketEarthReadingJotEval/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


def normalized_photo(data: bytes) -> Image.Image:
    image = Image.open(io.BytesIO(data)).convert("RGB")
    scale = min(1.0, MAX_SIDE / max(image.size))
    if scale < 1:
        image = image.resize(
            (round(image.width * scale), round(image.height * scale)),
            Image.Resampling.LANCZOS,
        )
    return image


def render_strokes(image: Image.Image, strokes: list[list[list[float]]]) -> Image.Image:
    preview = image.copy()
    draw = ImageDraw.Draw(preview)
    width = max(5, round(min(image.size) * 0.006))
    for stroke in strokes:
        points = [(round(x * image.width), round(y * image.height)) for x, y in stroke]
        draw.line(points, fill=(244, 34, 77), width=width, joint="curve")
    return preview


def main() -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    photos: dict[str, Image.Image] = {}
    for fixture in manifest["cases"]:
        filename = fixture["file"]
        if filename not in photos:
            target = FIXTURE_DIR / filename
            image = normalized_photo(download(fixture["source"]["downloadUrl"]))
            image.save(target, "JPEG", quality=91, optimize=True)
            photos[filename] = image
        render_strokes(photos[filename], fixture["strokes"]).save(
            FIXTURE_DIR / fixture["annotatedFile"], "JPEG", quality=92, optimize=True
        )
    for path in sorted(FIXTURE_DIR.glob("*.jpg")):
        with Image.open(path) as image:
            print(f"{path.relative_to(ROOT)} {image.width}x{image.height}")


if __name__ == "__main__":
    main()
