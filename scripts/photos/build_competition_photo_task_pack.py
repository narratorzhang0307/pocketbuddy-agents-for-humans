#!/usr/bin/env python3
"""Build the deterministic Pocket Earth competition photo task pack.

The output is deliberately outside ``public/``: it is copied to a clean
Android phone's DCIM directory and then discovered through the native photo
library bridge.  Original app assets are never duplicated into the APK.

The pack combines attributed stock photos already audited by the project,
two attributed Unsplash cat photos, deterministic photographic degradations,
and fictitious synthetic documents.  Every expected decision lives in the
manifest rather than being hidden in filenames or image pixels.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import html
import io
import json
import math
import os
from pathlib import Path
import random
import re
import shutil
import tempfile
import urllib.request
import zipfile
from datetime import datetime, timedelta
from fractions import Fraction
from typing import Any, Callable
from zoneinfo import ZoneInfo

import piexif
import piexif.helper
import qrcode
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEMO_LIBRARY = PROJECT_ROOT / "deliverables/pocket-earth-demo-photo-library"
DEMO_MANIFEST = DEMO_LIBRARY / "manifest.json"
DEFAULT_OUTPUT = PROJECT_ROOT / "deliverables/pocket-earth-competition-photo-task-pack"
TIMEZONE = ZoneInfo("Asia/Shanghai")
FONT = "/System/Library/Fonts/STHeiti Medium.ttc"
FONT_LIGHT = "/System/Library/Fonts/STHeiti Light.ttc"
RNG = random.Random(20260812)

CAT_SOURCES = {
    "cat-window": {
        "url": "https://images.unsplash.com/photo-1561237060-5f04168ccae9?auto=format&fit=max&w=1800&q=88",
        "author": "Matilda Bruder",
        "authorLink": "https://unsplash.com/@matildabruder",
        "photoLink": "https://unsplash.com/photos/cat-sitting-on-window-A1QsKMU02lQ",
        "license": "Unsplash License",
    },
    "cat-round-window": {
        "url": "https://images.unsplash.com/photo-1679204474013-866629dac1dc?auto=format&fit=max&w=1800&q=88",
        "author": "Jeswin Thomas",
        "authorLink": "https://unsplash.com/@jeswinthomas",
        "photoLink": "https://unsplash.com/photos/a-cat-sitting-inside-of-a-round-window-5R4c77jZ0KU",
        "license": "Unsplash License",
    },
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def safe_name(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]+", "-", value).strip("-")[:72]


def rational(value: float) -> tuple[int, int]:
    fraction = Fraction(value).limit_denominator(1_000_000)
    return fraction.numerator, fraction.denominator


def degrees(value: float) -> tuple[tuple[int, int], tuple[int, int], tuple[int, int]]:
    absolute = abs(value)
    whole = int(absolute)
    minutes_float = (absolute - whole) * 60
    minutes = int(minutes_float)
    seconds = (minutes_float - minutes) * 60
    return (whole, 1), (minutes, 1), rational(seconds)


def exif_bytes(taken_at: datetime, gps: tuple[float, float] | None, description: str) -> bytes:
    stamp = taken_at.strftime("%Y:%m:%d %H:%M:%S")
    zeroth = {
        piexif.ImageIFD.ImageDescription: description.encode("utf-8"),
        # The pack emulates photos exported from a fresh competition handset.
        # Keep ordinary camera identity fields so the app exercises realistic
        # MediaStore/EXIF priors instead of treating every transformed photo as
        # social-media content with stripped metadata.
        piexif.ImageIFD.Make: b"Pocket Earth Demo",
        piexif.ImageIFD.Model: b"Competition Camera",
        piexif.ImageIFD.Software: b"Pocket Earth competition task-pack builder",
        piexif.ImageIFD.DateTime: stamp.encode("ascii"),
    }
    exif = {
        piexif.ExifIFD.DateTimeOriginal: stamp.encode("ascii"),
        piexif.ExifIFD.DateTimeDigitized: stamp.encode("ascii"),
        piexif.ExifIFD.OffsetTime: b"+08:00",
        piexif.ExifIFD.OffsetTimeOriginal: b"+08:00",
        piexif.ExifIFD.OffsetTimeDigitized: b"+08:00",
        piexif.ExifIFD.UserComment: piexif.helper.UserComment.dump(
            "Synthetic Pocket Earth competition timeline; ground truth and attribution are in manifest.json",
            encoding="unicode",
        ),
    }
    gps_ifd: dict[int, Any] = {}
    if gps is not None:
        latitude, longitude = gps
        gps_ifd = {
            piexif.GPSIFD.GPSLatitudeRef: ("N" if latitude >= 0 else "S").encode("ascii"),
            piexif.GPSIFD.GPSLatitude: degrees(latitude),
            piexif.GPSIFD.GPSLongitudeRef: ("E" if longitude >= 0 else "W").encode("ascii"),
            piexif.GPSIFD.GPSLongitude: degrees(longitude),
            piexif.GPSIFD.GPSDateStamp: taken_at.strftime("%Y:%m:%d").encode("ascii"),
        }
    return piexif.dump({"0th": zeroth, "Exif": exif, "GPS": gps_ifd, "1st": {}, "thumbnail": None})


def download(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "PocketEarthCompetitionTaskPack/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


def load_rgb(path: Path) -> Image.Image:
    with Image.open(path) as source:
        return ImageOps.exif_transpose(source).convert("RGB")


def normalized(image: Image.Image, max_side: int = 1800) -> Image.Image:
    result = image.copy()
    result.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    return result


def original(image: Image.Image) -> Image.Image:
    return normalized(image)


def crop_shift(image: Image.Image) -> Image.Image:
    image = normalized(image)
    width, height = image.size
    margin_x = max(2, round(width * 0.035))
    margin_y = max(2, round(height * 0.025))
    return image.crop((margin_x, 0, width, height - margin_y)).resize((width, height), Image.Resampling.LANCZOS)


def warm_light(image: Image.Image) -> Image.Image:
    image = ImageEnhance.Brightness(normalized(image)).enhance(1.06)
    red, green, blue = image.split()
    red = red.point(lambda value: min(255, round(value * 1.035)))
    blue = blue.point(lambda value: round(value * 0.97))
    return Image.merge("RGB", (red, green, blue))


def soft_blur(image: Image.Image) -> Image.Image:
    return normalized(image).filter(ImageFilter.GaussianBlur(2.2))


def heavy_blur(image: Image.Image) -> Image.Image:
    return normalized(image).filter(ImageFilter.GaussianBlur(7.5))


def low_contrast(image: Image.Image) -> Image.Image:
    image = ImageEnhance.Contrast(normalized(image)).enhance(0.22)
    overlay = Image.new("RGB", image.size, (175, 175, 170))
    return Image.blend(image, overlay, 0.32)


def underexposed(image: Image.Image) -> Image.Image:
    return ImageEnhance.Brightness(normalized(image)).enhance(0.18)


def glare(image: Image.Image) -> Image.Image:
    image = normalized(image)
    layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    width, height = image.size
    for step in range(9):
        alpha = max(8, 56 - step * 6)
        inset = step * max(5, width // 160)
        draw.ellipse(
            (width * 0.44 - inset, height * 0.08 - inset, width * 1.04 + inset, height * 0.78 + inset),
            fill=(255, 255, 245, alpha),
        )
    result = Image.alpha_composite(image.convert("RGBA"), layer).convert("RGB")
    # A clipped reflection band makes the stress case measurable by the same
    # local exposure gate used on-device, instead of relying on a hidden label.
    draw_result = ImageDraw.Draw(result)
    width, height = result.size
    draw_result.polygon([
        (round(width * 0.56), 0), (round(width * 0.90), 0),
        (round(width * 0.62), height), (round(width * 0.28), height),
    ], fill=(255, 255, 250))
    return result


def exact_reencode(image: Image.Image) -> Image.Image:
    return normalized(image)


def write_photo(
    image: Image.Image,
    target: Path,
    taken_at: datetime,
    gps: tuple[float, float] | None,
    description: str,
    quality: int = 91,
) -> None:
    image.save(target, "JPEG", quality=quality, optimize=True, exif=exif_bytes(taken_at, gps, description))
    timestamp = taken_at.timestamp()
    os.utime(target, (timestamp, timestamp))


def font(size: int, light: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_LIGHT if light else FONT, size=size)


def text(draw: ImageDraw.ImageDraw, xy: tuple[int, int], value: str, size: int, fill: str = "#111111", light: bool = False) -> None:
    draw.text(xy, value, font=font(size, light), fill=fill)


def qr_image(payload: str, size: int) -> Image.Image:
    qr = qrcode.QRCode(version=4, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=8, border=3)
    qr.add_data(payload)
    qr.make(fit=True)
    return qr.make_image(fill_color="black", back_color="white").convert("RGB").resize((size, size), Image.Resampling.NEAREST)


def document_canvas(kind: str, hard: bool = False) -> Image.Image:
    image = Image.new("RGB", (1080, 1440), "#f1eee7")
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((92, 70, 988, 1370), radius=24, fill="white", outline="#111111", width=5)
    if kind == "receipt":
        text(draw, (150, 125), "POCKET EARTH COFFEE", 48)
        text(draw, (150, 205), "西湖边店 · 电子小票", 30, "#444444", True)
        draw.line((150, 270, 930, 270), fill="#111111", width=3)
        rows = [("拿铁", "1", "28.00"), ("桂花司康", "2", "36.00"), ("旅行贴纸", "1", "12.00")]
        y = 330
        for name, count, amount in rows:
            text(draw, (150, y), name, 32, light=True); text(draw, (560, y), count, 32, light=True); text(draw, (760, y), amount, 32, light=True); y += 86
        draw.line((150, y + 5, 930, y + 5), fill="#777777", width=2)
        text(draw, (150, y + 50), "合计", 42); text(draw, (725, y + 50), "¥76.00", 42)
        text(draw, (150, y + 145), "时间 2026-08-03 14:26", 28, "#444444", True)
        text(draw, (150, y + 200), "订单 PE-260803-0148", 28, "#444444", True)
        qr = qr_image("pocketearth://receipt/PE-260803-0148", 290)
        image.paste(qr, (395, 955))
        text(draw, (324, 1270), "仅为比赛演示虚构票据", 26, "#777777", True)
    elif kind == "parking":
        draw.rectangle((92, 70, 988, 220), fill="#151515")
        text(draw, (150, 110), "P  城市停车凭证", 48, "#ffffff")
        text(draw, (150, 285), "车场：杭州湖滨 P3", 36)
        text(draw, (150, 355), "入场：2026-07-18 10:32", 32, light=True)
        text(draw, (150, 420), "离场：2026-07-18 13:08", 32, light=True)
        text(draw, (150, 500), "应付：¥18.00", 46)
        text(draw, (150, 575), "凭证号：PARK-0718-0321", 30, light=True)
        qr = qr_image("pocketearth://parking/PARK-0718-0321", 420)
        image.paste(qr, (330, 740))
        text(draw, (270, 1215), "扫码仅打开演示路由，不发生支付", 25, "#777777", True)
    elif kind == "boarding":
        draw.rounded_rectangle((132, 170, 948, 1190), radius=35, fill="#f5f0ff", outline="#111111", width=5)
        text(draw, (190, 225), "POCKET AIR", 54)
        text(draw, (190, 315), "BOARDING PASS / 登机牌", 30, "#555555", True)
        text(draw, (190, 430), "HANGZHOU", 36); text(draw, (700, 430), "TOKYO", 36)
        text(draw, (190, 485), "HGH", 72); text(draw, (720, 485), "NRT", 72)
        draw.line((350, 540, 690, 540), fill="#111111", width=5)
        text(draw, (190, 650), "DATE  2025-12-20", 30, light=True)
        text(draw, (190, 710), "FLIGHT  PE 0812", 30, light=True)
        text(draw, (190, 770), "SEAT  18A", 30, light=True)
        qr = qr_image("pocketearth://boarding/PE0812/18A", 260)
        image.paste(qr, (600, 820))
        text(draw, (205, 1260), "虚构信息 · 仅用于离线视觉理解演示", 27, "#777777", True)
    else:
        raise ValueError(kind)
    return glare(image) if hard else image


def verify_photo(path: Path, expected: datetime, expect_gps: bool) -> dict[str, Any]:
    data = piexif.load(str(path))
    stamp = data["Exif"].get(piexif.ExifIFD.DateTimeOriginal, b"").decode("ascii")
    wanted = expected.strftime("%Y:%m:%d %H:%M:%S")
    if stamp != wanted:
        raise RuntimeError(f"{path.name}: DateTimeOriginal={stamp!r}, expected={wanted!r}")
    has_gps = piexif.GPSIFD.GPSLatitude in data["GPS"] and piexif.GPSIFD.GPSLongitude in data["GPS"]
    if has_gps != expect_gps:
        raise RuntimeError(f"{path.name}: GPS={has_gps}, expected={expect_gps}")
    make = data["0th"].get(piexif.ImageIFD.Make, b"").decode("ascii")
    model = data["0th"].get(piexif.ImageIFD.Model, b"").decode("ascii")
    if not make or not model:
        raise RuntimeError(f"{path.name}: missing camera identity EXIF")
    with Image.open(path) as image:
        image.verify()
    return {
        "dateTimeOriginal": stamp,
        "gps": has_gps,
        "cameraMake": make,
        "cameraModel": model,
        "mtimeDeltaSeconds": round(abs(path.stat().st_mtime - expected.timestamp()), 3),
        "sha256": sha256(path),
    }


def contact_sheet(items: list[dict[str, Any]], photos: Path, target: Path) -> None:
    columns, cell_w, cell_h = 4, 360, 320
    rows = math.ceil(len(items) / columns)
    canvas = Image.new("RGB", (columns * cell_w, 120 + rows * cell_h), "#e9e9e7")
    draw = ImageDraw.Draw(canvas)
    text(draw, (28, 24), "POCKET EARTH · COMPETITION PHOTO TASK PACK", 34)
    text(draw, (30, 76), "32 张 · 连拍 / 重复 / 技术问题 / 票据 / 语义 / GPS", 23, "#087a43", True)
    for index, item in enumerate(items):
        x = (index % columns) * cell_w
        y = 120 + (index // columns) * cell_h
        image = load_rgb(photos / item["filename"])
        image.thumbnail((cell_w - 24, 238), Image.Resampling.LANCZOS)
        tile = Image.new("RGB", (cell_w - 24, 238), "#d7d7d3")
        tile.paste(image, ((tile.width - image.width) // 2, (tile.height - image.height) // 2))
        canvas.paste(tile, (x + 12, y + 8))
        draw.rectangle((x + 12, y + 8, x + cell_w - 12, y + 246), outline="#111111", width=3)
        text(draw, (x + 16, y + 254), f"{index + 1:02d}  {item['label']}", 20)
        text(draw, (x + 16, y + 282), " · ".join(item["taskTags"][:3]), 16, "#555555", True)
    canvas.save(target, "PNG", optimize=True)


def write_html(items: list[dict[str, Any]], target: Path) -> None:
    cards = []
    for item in items:
        tags = " ".join(f"<span>{html.escape(tag)}</span>" for tag in item["taskTags"])
        cards.append(
            f'<article><img src="photos/{html.escape(item["filename"])}"><b>{html.escape(item["label"])}</b>'
            f'<small>{html.escape(item["expectedRole"])}</small><div>{tags}</div></article>'
        )
    target.write_text(
        "<!doctype html><meta charset='utf-8'><title>Pocket Earth Photo Task Pack</title>"
        "<style>body{font-family:system-ui;margin:24px;background:#e9e9e7}h1{font-size:28px}main{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}article{border:3px solid #111;background:#fff;padding:9px}img{width:100%;aspect-ratio:1;object-fit:cover;border:2px solid #111}b,small{display:block;margin-top:7px}small{color:#666}span{font-size:11px;border:1px solid #999;padding:2px 4px;margin:4px 3px 0 0;display:inline-block}</style>"
        f"<h1>POCKET EARTH · COMPETITION PHOTO TASK PACK</h1><p>{len(items)} 张；所有日期均为演示时间，票据均为虚构信息。</p><main>{''.join(cards)}</main>",
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    output = args.output.resolve()
    archive = output.with_suffix(".zip")
    if output.exists() or archive.exists():
        raise SystemExit(f"Refusing to overwrite existing task pack: {output} / {archive}")

    demo = json.loads(DEMO_MANIFEST.read_text(encoding="utf-8"))
    by_id = {item["id"]: item for item in demo["photos"]}
    source_paths = {item_id: DEMO_LIBRARY / "photos" / item["filename"] for item_id, item in by_id.items()}
    required = [
        "w-iAywMjSK0nQ", "w-oZJFZM_PB14", "w-qo9SoxDDxLs", "w-dYJKdCgH1vE",
        "w-pex_17751832", "w-pex_35730900", "w-pex_36847210", "w-9W5MRvrfNuk",
        "w-JOgxiQh2-cs", "w-H7eTEXPtRn0", "w-pex_5794705", "w-pex_35677535",
    ]
    missing = [item_id for item_id in required if item_id not in source_paths]
    if missing:
        raise RuntimeError(f"Demo source images missing: {missing}")

    staging = Path(tempfile.mkdtemp(prefix=".pe-photo-task-pack-", dir=output.parent))
    photos = staging / "photos"
    photos.mkdir(parents=True)
    items: list[dict[str, Any]] = []
    verifications: list[dict[str, Any]] = []
    source_cache: dict[str, Image.Image] = {}

    def demo_source(item_id: str) -> tuple[Image.Image, dict[str, Any]]:
        if item_id not in source_cache:
            source_cache[item_id] = load_rgb(source_paths[item_id])
        source = by_id[item_id]
        return source_cache[item_id].copy(), {
            "sourceId": item_id,
            "author": source.get("author", ""),
            "authorLink": source.get("authorLink", ""),
            "photoLink": source.get("photoLink", ""),
            "license": "Unsplash License or Pexels License; see source page",
        }

    cat_cache: dict[str, Image.Image] = {}

    def cat_source(item_id: str) -> tuple[Image.Image, dict[str, Any]]:
        if item_id not in cat_cache:
            cat_cache[item_id] = Image.open(io.BytesIO(download(CAT_SOURCES[item_id]["url"]))).convert("RGB")
        return cat_cache[item_id].copy(), {"sourceId": item_id, **CAT_SOURCES[item_id]}

    def add(
        label: str,
        source: tuple[Image.Image, dict[str, Any]] | Image.Image,
        taken_at: datetime,
        gps: tuple[float, float] | None,
        transform: Callable[[Image.Image], Image.Image],
        expected_role: str,
        task_tags: list[str],
        group_id: str | None = None,
        preferred: bool | None = None,
        quality: int = 91,
    ) -> None:
        index = len(items) + 1
        if isinstance(source, tuple):
            image, attribution = source
        else:
            image, attribution = source, {"sourceId": "synthetic-document", "author": "Pocket Earth", "license": "Project-generated fictitious fixture"}
        image = transform(image)
        filename = f"{taken_at:%Y%m%d_%H%M%S}_PE_TASK_{index:02d}_{safe_name(label)}.jpg"
        target = photos / filename
        write_photo(image, target, taken_at, gps, "Pocket Earth competition task pack", quality)
        verification = verify_photo(target, taken_at, gps is not None)
        item = {
            "index": index,
            "filename": filename,
            "label": label,
            "demoDateTime": taken_at.isoformat(),
            "demoTimestampSynthetic": True,
            "latitude": gps[0] if gps else None,
            "longitude": gps[1] if gps else None,
            "hasGps": gps is not None,
            "expectedRole": expected_role,
            "taskTags": task_tags,
            "groupId": group_id,
            "preferredRepresentative": preferred,
            "width": image.width,
            "height": image.height,
            "bytes": target.stat().st_size,
            "sha256": verification["sha256"],
            "source": attribution,
        }
        items.append(item)
        verifications.append({"filename": filename, **verification})

    tz = TIMEZONE
    # Three real event/burst groups.  Variants are seconds apart and share GPS.
    burst_specs = [
        ("burst-shanghai", demo_source("w-iAywMjSK0nQ"), datetime(2026, 8, 11, 9, 30, tzinfo=tz), (31.3134, 121.5567), "上海江边连拍"),
        ("burst-hangzhou-cat", cat_source("cat-window"), datetime(2025, 10, 5, 16, 20, tzinfo=tz), (30.2741, 120.1551), "去年杭州的猫"),
        ("burst-friends-beach", demo_source("w-oZJFZM_PB14"), datetime(2026, 7, 29, 18, 42, tzinfo=tz), (12.0086, 121.9660), "海边朋友连拍"),
    ]
    variants = [("原片", original, True), ("暖光", warm_light, False), ("轻裁切", crop_shift, False), ("轻微虚焦", soft_blur, False)]
    for group_id, source, start, gps, title in burst_specs:
        for offset, (suffix, transform, preferred) in enumerate(variants):
            add(f"{title}·{suffix}", source, start + timedelta(seconds=offset * 2), gps, transform, "burst-candidate", ["连拍", "审美二选一", "代表图"], group_id, preferred)

    # Four separate duplicate pairs.  They are deliberately near-identical and time-local.
    duplicate_sources = [
        ("dup-temple", "w-qo9SoxDDxLs", datetime(2024, 6, 9, 10, 5, tzinfo=tz), (39.9504, 113.1622), "古建筑"),
        ("dup-bridge", "w-dYJKdCgH1vE", datetime(2023, 5, 18, 20, 12, tzinfo=tz), (47.6360, 19.1783), "夜桥"),
        ("dup-lighthouse", "w-pex_17751832", datetime(2022, 4, 2, 8, 24, tzinfo=tz), (58.1188, 7.3360), "灯塔"),
        ("dup-city", "w-pex_35730900", datetime(2021, 3, 16, 18, 10, tzinfo=tz), (13.6929, -89.2182), "城市落日"),
    ]
    for group_id, source_id, start, gps, label in duplicate_sources:
        source = demo_source(source_id)
        add(f"{label}·原始", source, start, gps, original, "duplicate-reference", ["疑似重复", "保留代表"], group_id, True, 93)
        add(f"{label}·重复", source, start + timedelta(seconds=18), gps, exact_reencode, "duplicate-candidate", ["疑似重复", "仅建议不删除"], group_id, False, 87)

    # Technical stress cases: distinct times avoid accidentally merging into events.
    stress = [
        ("误拍·严重模糊", "w-pex_36847210", datetime(2026, 8, 7, 11, 2, tzinfo=tz), None, heavy_blur, "blur"),
        ("低对比·雾化", "w-9W5MRvrfNuk", datetime(2026, 8, 6, 15, 44, tzinfo=tz), None, low_contrast, "low-contrast"),
        ("严重欠曝", "w-JOgxiQh2-cs", datetime(2026, 8, 5, 21, 18, tzinfo=tz), None, underexposed, "underexposed"),
        ("强反光遮挡", "w-H7eTEXPtRn0", datetime(2026, 8, 4, 13, 8, tzinfo=tz), None, glare, "glare"),
    ]
    for label, source_id, stamp, gps, transform, issue in stress:
        add(label, demo_source(source_id), stamp, gps, transform, "technical-issue", ["技术问题", issue, "只建议"], None, False, 84)

    # Fictitious documents.  The hard receipt exists to exercise Base -> OCR LoRA quality routing.
    docs = [
        ("咖啡票据·清晰", document_canvas("receipt"), datetime(2026, 8, 3, 14, 26, tzinfo=tz), "receipt-clean", ["票据", "OCR", "Base优先"]),
        ("咖啡票据·反光难例", document_canvas("receipt", hard=True), datetime(2026, 8, 3, 14, 28, tzinfo=tz), "receipt-hard", ["票据", "反光", "OCR LoRA候选"]),
        ("停车票·二维码", document_canvas("parking"), datetime(2026, 7, 18, 13, 8, tzinfo=tz), "parking-qr", ["停车票据", "二维码", "OCR"]),
        ("登机牌·杭州东京", document_canvas("boarding"), datetime(2025, 12, 20, 7, 35, tzinfo=tz), "boarding-pass", ["登机牌", "东京", "OCR"]),
    ]
    for label, image, stamp, role, tags in docs:
        add(label, image, stamp, None, original, role, tags, None, None, 94)

    # Independent semantic/GPS probes that should not collapse into the above groups.
    semantic = [
        ("窗中猫·独立样本", cat_source("cat-round-window"), datetime(2026, 2, 14, 15, 30, tzinfo=tz), (30.2741, 120.1551), ["猫", "宠物", "杭州"]),
        ("无GPS湖景", demo_source("w-pex_5794705"), datetime(2026, 1, 9, 9, 18, tzinfo=tz), None, ["湖景", "无GPS", "地点推断"]),
        ("旅行地标", demo_source("w-pex_35677535"), datetime(2020, 9, 12, 17, 22, tzinfo=tz), (41.0082, 28.9784), ["地标", "旅行", "GPS"]),
        ("同行朋友", demo_source("w-t0S_5qM-8AE"), datetime(2025, 8, 22, 18, 46, tzinfo=tz), (15.4370, 74.2617), ["朋友", "人物", "旅行"]),
    ]
    for label, source, stamp, gps, tags in semantic:
        add(label, source, stamp, gps, original, "semantic-probe", tags, None, True)

    if len(items) != 32:
        raise RuntimeError(f"Task pack contract drifted: expected 32 items, got {len(items)}")
    timeline_years = sorted({int(item["demoDateTime"][:4]) for item in items})
    if timeline_years != list(range(2020, 2027)):
        raise RuntimeError(f"Timeline contract drifted: expected every year 2020-2026, got {timeline_years}")

    expected = {
        "schema": "pocket-earth.photo-task-pack-expected/v1",
        "photoCount": len(items),
        "timelineYears": timeline_years,
        "minimumFirstScreen": {"burstGroups": 3, "duplicateGroups": 4, "technicalIssues": 4, "documents": 4, "earthCandidates": 5},
        "semanticQueries": {
            "去年杭州拍的猫": [item["filename"] for item in items if item["groupId"] == "burst-hangzhou-cat"],
            "所有停车票据": [item["filename"] for item in items if "停车票据" in item["taskTags"]],
            "带二维码的照片": [item["filename"] for item in items if "二维码" in item["taskTags"]],
            "东京旅行中有朋友的照片": [item["filename"] for item in items if "东京" in item["taskTags"] or "朋友" in item["taskTags"]],
            "没有 GPS 但像湖边的照片": [item["filename"] for item in items if "无GPS" in item["taskTags"]],
        },
        "rules": [
            "所有删除动作只能是建议；不得直接删除系统相册原片。",
            "清晰票据停在 Qwen Base；反光难例才允许路由到 OCR LoRA，并通过质量门后采纳。",
            "连拍代表图、通用审美和个人偏好必须显示为不同证据。",
            "只有用户确认的照片才能进入杂志和日历。",
        ],
    }
    manifest = {
        "schema": "pocket-earth.competition-photo-task-pack/v1",
        "generatedAt": datetime.now(tz).isoformat(),
        "photoCount": len(items),
        "timeline": {
            "first": min(item["demoDateTime"] for item in items),
            "last": max(item["demoDateTime"] for item in items),
            "years": timeline_years,
        },
        "privacy": "All documents and identifiers are fictitious; no private user photo or OCR body is included.",
        "licensing": {
            "stock": ["https://unsplash.com/license", "https://www.pexels.com/legal-pages/license/"],
            "researchOnlyTrainingDatasets": [
                "TAD66K is used for model research/evaluation only and is not redistributed in this phone task pack.",
                "AADB is used for model research/evaluation only and is not redistributed in this phone task pack.",
            ],
        },
        "items": items,
    }
    (staging / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (staging / "expected-results.json").write_text(json.dumps(expected, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (staging / "verification.json").write_text(json.dumps({"verified": len(verifications), "items": verifications}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    with (staging / "manifest.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        fields = ["index", "filename", "label", "demoDateTime", "hasGps", "expectedRole", "groupId", "preferredRepresentative", "taskTags", "sha256"]
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for item in items:
            writer.writerow({**item, "taskTags": "|".join(item["taskTags"])})
    contact_sheet(items, photos, staging / "task-pack-overview.png")
    write_html(items, staging / "task-pack-overview.html")
    (staging / "README.md").write_text(
        """# Pocket Earth 决赛照片任务包

本包包含 32 张可直接导入新安卓手机的 JPEG。它不是 APK 内置相册：导入后 Pocket Earth 只通过系统相册 assetId、缩略图与派生索引做轻路由，原片仍只在系统相册。

## 导入

```bash
adb shell mkdir -p /sdcard/DCIM/PocketEarthCompetition
adb push -a photos/. /sdcard/DCIM/PocketEarthCompetition/
adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/DCIM/PocketEarthCompetition
```

进入 Photos → 照片整理，授权后点击构建照片集。默认验收至少应出现 3 组连拍、4 组重复、4 张技术问题、4 张文档和 5 张可落地球候选。

票据、登机牌、订单号与二维码内容均为虚构。演示日期覆盖 2020–2026，并写入 EXIF DateTimeOriginal；GPS 只写入需要验证地图路由的样本。素材作者、来源与许可证见 manifest.json。
""",
        encoding="utf-8",
    )

    shutil.move(str(staging), str(output))
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED, compresslevel=7) as bundle:
        for path in sorted(output.rglob("*")):
            if path.is_file():
                bundle.write(path, Path(output.name) / path.relative_to(output))
    print(json.dumps({"output": str(output), "archive": str(archive), "photos": len(items), "archiveSha256": sha256(archive)}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
