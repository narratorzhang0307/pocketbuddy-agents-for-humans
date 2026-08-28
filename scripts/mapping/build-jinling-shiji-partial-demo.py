#!/usr/bin/env python3
"""Build the ten-page, evidence-backed Mapping Skill demo from the source PDF."""

from __future__ import annotations

import io
import hashlib
import json
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from pypdf.generic import DecodedStreamObject, NameObject
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


WORKSPACE = Path(__file__).resolve().parents[2]
SOURCE_ROOT = Path("/Users/zhangcheng/Documents/上街去/城市地图skill/南京古籍/map-jinling-shiji")
SOURCE_PDF = Path(
    "/Users/zhangcheng/Documents/上街去/城市地图skill/南京古籍/"
    "金陵世纪 (（明）陈沂，（明）孙应岳，（清）余宾硕撰, (明)孙应岳撰 , 成林点校, "
    "孙应岳 etc.) (z-library.sk, 1lib.sk, z-lib.sk).pdf"
)
REFERENCES = SOURCE_ROOT / "references"
OUTPUT_PDF = WORKSPACE / "output/pdf/jinling-shiji-partial-10-page-demo.pdf"
PUBLIC_DIR = WORKSPACE / "public/assets/mapping-demo"
PUBLIC_PDF = PUBLIC_DIR / OUTPUT_PDF.name
PUBLIC_JSON = PUBLIC_DIR / "jinling-shiji-partial-10-page-demo.json"
OSS_ASSET_BASE = "https://assets-pocketearth.throughtheglass.art/pocket-earth/assets/mapping-demo"

# Book-local page -> original compilation PDF page. Chosen for place density and
# variety: chronology, fortifications, streets, residences, landscape, water,
# bridges, gardens, temples, and literary landmarks.
SELECTED = [
    (7, 33),
    (9, 35),
    (29, 55),
    (37, 63),
    (48, 74),
    (57, 83),
    (62, 88),
    (66, 92),
    (86, 112),
    (101, 127),
]
PREFERRED = {
    7: ["长干里", "秦淮"],
    9: ["石头城", "玄武湖"],
    29: ["朱雀桥", "桃叶渡"],
    37: ["乌衣巷", "瓦棺寺"],
    48: ["燕子矶", "幕府山"],
    57: ["凤凰台", "汤山"],
    62: ["板桥", "朱雀航"],
    66: ["谢公墩", "周处台"],
    86: ["栖霞寺", "牛首山"],
    101: ["白鹭洲", "劳劳亭"],
}


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def build_overlay(width: float, height: float, demo_page: int, original_page: int) -> bytes:
    buffer = io.BytesIO()
    layer = canvas.Canvas(buffer, pagesize=(width, height))
    layer.setFillColorRGB(1, 1, 1)
    layer.rect(0, height - 22, width, 22, fill=1, stroke=0)
    layer.setStrokeColorRGB(0, 0, 0)
    layer.setLineWidth(0.8)
    layer.line(0, height - 22, width, height - 22)
    layer.setFillColorRGB(0, 0, 0)
    layer.setFont("Helvetica-Bold", 8)
    layer.drawString(18, height - 15, "POCKET EARTH MAPPING DEMO")
    if "PocketChinese" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("PocketChinese", "/System/Library/Fonts/STHeiti Light.ttc", subfontIndex=0))
    layer.setFont("PocketChinese", 9)
    label = f"【部分】 {demo_page}/{len(SELECTED)}  ·  原 PDF {original_page}"
    layer.drawRightString(width - 18, height - 15, label)
    layer.save()
    return buffer.getvalue()


def namespace_overlay_fonts(page) -> None:
    """Prevent alternating source-page font names from corrupting the header."""
    fonts = page["/Resources"]["/Font"].get_object()
    names = {
        "/F1": "/PocketHeaderRegular",
        "/F2": "/PocketHeaderBold",
        "/F3+0": "/PocketHeaderChinese",
    }
    content = page.get_contents().get_data()
    for old, new in names.items():
        old_name = NameObject(old)
        if old_name not in fonts:
            continue
        fonts[NameObject(new)] = fonts.pop(old_name)
        content = content.replace(old.encode("ascii"), new.encode("ascii"))
    stream = DecodedStreamObject()
    stream.set_data(content)
    page[NameObject("/Contents")] = stream


def build_pdf() -> None:
    reader = PdfReader(str(SOURCE_PDF))
    writer = PdfWriter()
    for demo_page, (_, original_page) in enumerate(SELECTED, start=1):
        source_page = reader.pages[original_page - 1]
        width = float(source_page.mediabox.width)
        source_height = float(source_page.mediabox.height)
        height = source_height + 26
        # Keep the header as the base content. Some even source pages leave a
        # clipping/text state behind; merging them first can clip a later overlay.
        page = PdfReader(io.BytesIO(build_overlay(width, height, demo_page, original_page))).pages[0]
        namespace_overlay_fonts(page)
        page.merge_page(source_page)
        writer.add_page(page)
    writer.add_metadata(
        {
            "/Title": "《金陵世纪》（部分·10页 Mapping Skill 示例）",
            "/Author": "[明] 陈沂；Pocket Earth 示例页选择与标注",
            "/Subject": "PP-OCR + Qwen 2B/MNN 端侧文献地点提炼案例",
        }
    )
    OUTPUT_PDF.parent.mkdir(parents=True, exist_ok=True)
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PDF.open("wb") as handle:
        writer.write(handle)
    PUBLIC_PDF.write_bytes(OUTPUT_PDF.read_bytes())


def build_fixture() -> None:
    locations = read_json(REFERENCES / "locations.json")["places"]
    entries = read_json(REFERENCES / "place-entries.json")["entries"]
    ocr_rows = [json.loads(line) for line in (REFERENCES / "ocr-pages.jsonl").read_text(encoding="utf-8").splitlines() if line]
    location_by_id = {item["id"]: item for item in locations}
    page_map = {item["bookPdfPage"]: item for item in ocr_rows}
    demo_page_by_book = {book: index for index, (book, _) in enumerate(SELECTED, start=1)}

    candidates = []
    for book_page, names in PREFERRED.items():
        page_entries = [item for item in entries if item["bookPdfPage"] == book_page]
        for name in names:
            entry = next((item for item in page_entries if item["matchedAlias"] == name), None)
            if not entry:
                raise RuntimeError(f"Missing preferred place: page {book_page} / {name}")
            location = location_by_id[entry["placeId"]]
            candidates.append(
                {
                    "id": f"demo-{len(candidates) + 1}",
                    "name": name,
                    "page": demo_page_by_book[book_page],
                    "sourcePage": entry["originalCompilationPdfPage"],
                    "context": entry["snippet"],
                    "description": location["note"],
                    "relation": "mentioned",
                    "confirmed": False,
                    "status": location["status"],
                    "lat": location["lat"],
                    "lng": location["lng"],
                    "geocodeName": location["modernName"],
                    "resolutionSource": "local-gazetteer",
                }
            )

    fixture = {
        "schema": "pocket.mapping-demo/v1",
        "kind": "reviewed-example-snapshot",
        "notice": "案例快照用于网页体验；真机点击端侧运行时会重新执行 PP-OCR 与 Qwen 2B/MNN。",
        "file": {
            "name": OUTPUT_PDF.name,
            "url": f"{OSS_ASSET_BASE}/20260813-jinling-shiji-partial-5-page-demo-{hashlib.sha256(OUTPUT_PDF.read_bytes()).hexdigest()[:12]}.pdf",
            "title": "金陵世纪（部分）",
            "author": "[明] 陈沂",
            "era": "明代",
            "city": "南京",
            "pages": len(SELECTED),
        },
        "pages": [
            {
                "page": demo_page_by_book[book_page],
                "sourcePage": original_page,
                "text": page_map[book_page]["text"],
                "source": "reviewed-example-ocr",
                "meanConfidence": page_map[book_page]["meanConfidence"],
            }
            for book_page, original_page in SELECTED
        ],
        "candidates": candidates,
    }
    PUBLIC_JSON.write_text(json.dumps(fixture, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    if not SOURCE_PDF.exists():
        raise SystemExit(f"Source PDF not found: {SOURCE_PDF}")
    build_pdf()
    build_fixture()
    print(OUTPUT_PDF)
    print(PUBLIC_PDF)
    print(PUBLIC_JSON)
