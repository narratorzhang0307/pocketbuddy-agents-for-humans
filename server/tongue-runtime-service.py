from __future__ import annotations

import io
import json
import os
from pathlib import Path

import numpy as np
import torch
import uvicorn
from fastapi import FastAPI, HTTPException, Request
from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parent
WEIGHT = Path(os.environ.get("TONGUE_MODEL", ROOT / "models/tongue/tongueexpert_multitask.ts"))
METRICS = WEIGHT.with_name("tongueexpert_metrics.json")
MODEL = torch.jit.load(str(WEIGHT), map_location="cpu").eval() if WEIGHT.exists() else None
COAT_CLASSES = ["white", "light_yellow", "yellow"]
BODY_CLASSES = ["light", "regular", "dark"]
MEAN = torch.tensor([0.485, 0.456, 0.406]).view(3, 1, 1)
STD = torch.tensor([0.229, 0.224, 0.225]).view(3, 1, 1)

DISPLAY = {
    "coat:white": ("偏白苔观感", ["保持饮水和温和的常规口腔清洁，不要用力刮舌。"]),
    "coat:light_yellow": ("浅黄苔观感", ["先排除茶、咖啡、食物染色和暖光影响，再于白光下复测。"]),
    "coat:yellow": ("偏黄苔观感", ["先排除食物染色；持续黄苔或口腔不适时请咨询医生或牙医。"]),
    "body:light": ("舌质偏淡观感", ["优先保证规律饮食、补水和充分休息；持续伴随明显不适时请咨询专业人员。"]),
    "body:regular": ("舌质颜色较均匀", ["继续保持饮水、规律作息和均衡饮食。"]),
    "body:dark": ("舌质偏暗观感", ["先在自然白光下复测；若颜色变化持续或伴随不适，请寻求专业评估。"]),
}

app = FastAPI(title="Pocket Earth Tongue Observer", docs_url=None, redoc_url=None)


def preprocess(image: Image.Image) -> torch.Tensor:
    image = ImageOps.exif_transpose(image).convert("RGB")
    width, height = image.size
    if width <= 0 or height <= 0:
        raise ValueError("empty image")
    if width < height:
        resized = (256, int(256 * height / width))
    else:
        resized = (int(256 * width / height), 256)
    image = image.resize(resized, Image.Resampling.BILINEAR)
    left = max(0, (image.width - 224) // 2)
    top = max(0, (image.height - 224) // 2)
    image = image.crop((left, top, left + 224, top + 224))
    pixels = np.asarray(image, dtype=np.float32).copy()
    tensor = torch.from_numpy(pixels).permute(2, 0, 1) / 255.0
    return ((tensor - MEAN) / STD).unsqueeze(0)


@app.get("/health")
def health() -> dict:
    report = json.loads(METRICS.read_text(encoding="utf-8")) if METRICS.exists() else None
    return {
        "model_loaded": MODEL is not None,
        "dataset": "TonguExpert manual labels",
        "test_metrics": report.get("test") if report else None,
        "scope": "tongue coating color and tongue body color only",
        "image_retention": "none",
    }


@app.post("/predict")
async def predict(request: Request) -> dict:
    if MODEL is None:
        raise HTTPException(503, "trained tongue weight is not installed")
    try:
        image = Image.open(io.BytesIO(await request.body()))
        tensor = preprocess(image)
    except Exception as exc:
        raise HTTPException(400, "invalid image") from exc
    with torch.inference_mode():
        coat_logits, body_logits = MODEL(tensor)
        coat_prob, body_prob = coat_logits.softmax(1)[0], body_logits.softmax(1)[0]
    findings = []
    for head, classes, probabilities in (
        ("coat", COAT_CLASSES, coat_prob),
        ("body", BODY_CLASSES, body_prob),
    ):
        index = int(probabilities.argmax())
        source = f"{head}:{classes[index]}"
        label, advice = DISPLAY[source]
        findings.append(
            {
                "source_label": source,
                "label": label,
                "confidence": round(float(probabilities[index]), 4),
                "advice": advice,
            }
        )
    return {
        "findings": findings,
        "model": "TongueExpert-MobileNetV3-Small multi-head",
        "disclaimer": "Observable colors only; not a disease, qi/blood, or constitution diagnosis.",
    }


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8766, access_log=False)
