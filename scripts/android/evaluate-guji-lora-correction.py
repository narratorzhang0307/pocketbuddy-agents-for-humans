#!/usr/bin/env python3
"""Run a reproducible Base/Guji-LoRA correction A/B on an Android WebView.

The image is first transcribed with the bundled Chinese OCR model. Every
detected vertical line is then reviewed twice with the same crop, OCR hint,
prompt, decoding budget, and Qwen3-VL-2B base. The only changed variable is
the visual LoRA adapter.
"""

from __future__ import annotations

import argparse
import base64
import csv
import hashlib
import io
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

import websocket


DATASET = "ByteDance/AncientDoc"
DATASET_REVISION = "main"
LABEL_URL = (
    "https://huggingface.co/datasets/ByteDance/AncientDoc/resolve/main/label.csv"
)
DEFAULT_SAMPLES = (
    ("兵家类", "兵垣四編", "page_6.png"),
    ("艺术类", "定本正续书谱", "page_23.png"),
    ("传记类", "歷代小史", "page_9.png"),
)
HAN_RE = re.compile(r"[\u3400-\u9fff\U00020000-\U0002fa1f]")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cdp", default="http://127.0.0.1:9222")
    parser.add_argument("--samples", type=int, default=1, choices=(1, 2, 3))
    parser.add_argument("--max-lines", type=int, default=12)
    parser.add_argument("--output", type=Path)
    return parser.parse_args()


class Cdp:
    def __init__(self, endpoint: str):
        pages = json.load(urllib.request.urlopen(f"{endpoint}/json"))
        page = next(item for item in pages if item.get("type") == "page")
        self.ws = websocket.create_connection(
            page["webSocketDebuggerUrl"], timeout=240, suppress_origin=True
        )
        self.message_id = 0

    def close(self) -> None:
        self.ws.close()

    def evaluate(self, expression: str):
        self.message_id += 1
        message_id = self.message_id
        self.ws.send(
            json.dumps(
                {
                    "id": message_id,
                    "method": "Runtime.evaluate",
                    "params": {
                        "expression": expression,
                        "awaitPromise": True,
                        "returnByValue": True,
                    },
                }
            )
        )
        while True:
            message = json.loads(self.ws.recv())
            if message.get("id") != message_id:
                continue
            result = message.get("result", {})
            if "exceptionDetails" in result:
                raise RuntimeError(json.dumps(result, ensure_ascii=False))
            return result["result"].get("value")


def download(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "PocketEarthEval/1"})
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read()


def dataset_rows() -> dict[tuple[str, str], dict[str, str]]:
    label_bytes = download(LABEL_URL)
    reader = csv.DictReader(io.StringIO(label_bytes.decode("utf-8-sig")))
    return {(row["type"], row["name"]): row for row in reader}


def image_url(category: str, book: str, page: str) -> str:
    path = "/".join(("imgs", category, book, page))
    encoded = urllib.parse.quote(path, safe="/")
    return (
        f"https://huggingface.co/datasets/{DATASET}/resolve/"
        f"{DATASET_REVISION}/{encoded}"
    )


def data_url(image_bytes: bytes, page: str) -> str:
    media_type = "image/png" if page.lower().endswith(".png") else "image/jpeg"
    return f"data:{media_type};base64,{base64.b64encode(image_bytes).decode('ascii')}"


def normalize(text: str) -> str:
    return "".join(HAN_RE.findall(text or ""))


def edit_distance(left: str, right: str) -> int:
    if len(left) < len(right):
        left, right = right, left
    previous = list(range(len(right) + 1))
    for index, left_char in enumerate(left, start=1):
        current = [index]
        for right_index, right_char in enumerate(right, start=1):
            current.append(
                min(
                    current[-1] + 1,
                    previous[right_index] + 1,
                    previous[right_index - 1] + (left_char != right_char),
                )
            )
        previous = current
    return previous[-1]


def metric(prediction: str, reference: str) -> dict[str, float | int]:
    prediction_norm = normalize(prediction)
    reference_norm = normalize(reference)
    edits = edit_distance(prediction_norm, reference_norm)
    return {
        "predictionCharacters": len(prediction_norm),
        "referenceCharacters": len(reference_norm),
        "edits": edits,
        "cer": edits / max(1, len(reference_norm)),
    }


def native_ocr(cdp: Cdp, image: str) -> dict:
    expression = f"""
(async () => await window.Capacitor.Plugins.PocketMnn.run({{request: {{
  task: 'ocr_chinese', image: {json.dumps(image)}
}}}}))()
"""
    return cdp.evaluate(expression)


def review_line(
    cdp: Cdp,
    image: str,
    line: dict,
    candidate: str,
    adapter: str,
) -> dict:
    han_count = len(normalize(candidate))
    max_tokens = min(128, max(48, han_count + 24))
    prompt = (
        "图中只有繁体竖排古籍的一栏正文。"
        f"专业OCR候选是：“{candidate}”。"
        "请逐字对照图片校正候选；保留繁体字和异体字；"
        "不得添加图片中没有的句子，不得解释，无法确认的字写□。"
        "只输出校正后的一栏。"
    )
    expression = f"""
(async () => {{
  const source = await new Promise((resolve, reject) => {{
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = reject;
    element.src = {json.dumps(image)};
  }});
  const box = {json.dumps(line)};
  const padX = Math.max(10, Math.round((box.right - box.left) * 0.20));
  const padY = 16;
  const x = Math.max(0, box.left - padX);
  const y = Math.max(0, box.top - padY);
  const width = Math.min(source.naturalWidth - x, box.right - box.left + padX * 2);
  const height = Math.min(source.naturalHeight - y, box.bottom - box.top + padY * 2);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(source, x, y, width, height, 0, 0, width, height);
  return await window.Capacitor.Plugins.PocketMnn.run({{request: {{
    task: 'vision',
    image: canvas.toDataURL('image/jpeg', 0.96),
    prompt: {json.dumps(prompt)},
    adapter: {json.dumps(adapter)},
    detail: 'ocr',
    maxTokens: {max_tokens}
  }}}});
}})()
"""
    return cdp.evaluate(expression)


def main() -> int:
    args = parse_args()
    rows = dataset_rows()
    selected = DEFAULT_SAMPLES[: args.samples]
    cdp = Cdp(args.cdp)
    evidence = {
        "schema": "pocketearth.guji_ocr_hint_base_lora_android_ab/v1",
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "design": {
            "device": "vivo V2509A",
            "base": "Qwen3-VL-2B-Instruct / MNN 3.6.1",
            "variable": "guji-vision visual LoRA enabled vs disabled",
            "fixed": [
                "same source image",
                "same bundled OCR candidate",
                "same detected column crop",
                "same prompt",
                "same max token rule",
            ],
        },
        "dataset": {
            "id": DATASET,
            "revision": DATASET_REVISION,
            "labelUrl": LABEL_URL,
            "license": "CC0-1.0",
        },
        "samples": [],
    }
    try:
        for sample_index, (category, book, page) in enumerate(selected, start=1):
            row = rows[(category, f"{book}{page}")]
            source_url = image_url(category, book, page)
            image_bytes = download(source_url)
            image = data_url(image_bytes, page)
            print(
                f"[{sample_index}/{len(selected)}] {category}/{book}/{page}: native OCR",
                flush=True,
            )
            ocr = native_ocr(cdp, image)
            lines = [
                line
                for line in ocr.get("ocrLines", [])
                if len(normalize(line.get("text", ""))) >= 4
            ][: args.max_lines]
            sample = {
                "id": f"{category}/{book}/{page}",
                "sourceUrl": source_url,
                "imageSha256": hashlib.sha256(image_bytes).hexdigest(),
                "reference": row["OCR"],
                "nativeOcr": ocr.get("text", ""),
                "nativeStats": ocr.get("stats", {}),
                "lines": [],
            }
            for line_index, line in enumerate(lines, start=1):
                candidate = line.get("text", "")
                print(
                    f"  line {line_index}/{len(lines)}: Base then LoRA ({candidate[:18]})",
                    flush=True,
                )
                base = review_line(cdp, image, line, candidate, "")
                lora = review_line(cdp, image, line, candidate, "guji-vision")
                sample["lines"].append(
                    {
                        "box": {
                            key: line.get(key)
                            for key in ("left", "top", "right", "bottom")
                        },
                        "ocr": candidate,
                        "base": base.get("text", ""),
                        "lora": lora.get("text", ""),
                        "baseStats": base.get("stats", {}),
                        "loraStats": lora.get("stats", {}),
                        "adapterLoaded": lora.get("adapterLoaded", False),
                    }
                )
            sample["baseText"] = "\n".join(line["base"] for line in sample["lines"])
            sample["loraText"] = "\n".join(line["lora"] for line in sample["lines"])
            sample["metrics"] = {
                "nativeOcr": metric(sample["nativeOcr"], sample["reference"]),
                "base": metric(sample["baseText"], sample["reference"]),
                "lora": metric(sample["loraText"], sample["reference"]),
            }
            evidence["samples"].append(sample)
    finally:
        cdp.close()

    for variant in ("nativeOcr", "base", "lora"):
        edits = sum(sample["metrics"][variant]["edits"] for sample in evidence["samples"])
        refs = sum(
            sample["metrics"][variant]["referenceCharacters"]
            for sample in evidence["samples"]
        )
        evidence.setdefault("aggregate", {})[variant] = {
            "edits": edits,
            "referenceCharacters": refs,
            "cer": edits / max(1, refs),
        }
    evidence["aggregate"]["loraVsBaseRelativeCerImprovement"] = (
        evidence["aggregate"]["base"]["cer"]
        - evidence["aggregate"]["lora"]["cer"]
    ) / max(evidence["aggregate"]["base"]["cer"], 1e-9)
    rendered = json.dumps(evidence, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8")
    print(rendered)
    return 0


if __name__ == "__main__":
    sys.exit(main())
