"""One real SAM inference per process; image/masks stay in memory, no training."""
import base64
import io
import json
import os
import sys
import time
from contextlib import redirect_stdout

from PIL import Image, ImageOps
from food_harness import HarnessConfig, run_harness
from grounding import parse_grounding_json
from providers import FrozenSam2Segmenter

Image.MAX_IMAGE_PIXELS = 1024 * 1024
CHECKPOINT_SHA256 = "a2345aede8715ab1d5d31b4a509fb160c5a4af1970f199d9054ccfb746c004c5"
MODEL = "sam2.1_hiera_base_plus"
VERSION = "photos-harness/v1"


def decode_request(value):
    if not isinstance(value, dict):
        raise ValueError("request_not_object")
    data = value.get("image", "")
    if not isinstance(data, str) or len(data) > 1500000:
        raise ValueError("bounded_inline_photo_required")
    prefix, encoded = data.split(",", 1)
    if prefix not in ("data:image/jpeg;base64", "data:image/png;base64"):
        raise ValueError("jpeg_or_png_required")
    raw = base64.b64decode(encoded, validate=True)
    image = Image.open(io.BytesIO(raw))
    if image.format not in ("JPEG", "PNG") or max(image.size) > 1024 or min(image.size) < 8:
        raise ValueError("image_dimensions_out_of_bounds")
    image = ImageOps.exif_transpose(image).convert("RGB")
    grounding = parse_grounding_json(value.get("grounding"))
    # Model-supplied identifiers must never become filenames or HTML identifiers.
    grounding = {**grounding, "items": [
        {**item, "region_id": f"r{index:03d}"}
        for index, item in enumerate(grounding["items"], 1)
    ]}
    return image, grounding


class MemorySegmenter(FrozenSam2Segmenter):
    def _save_mask(self, mask, filename):
        # Alpha is the actual SAM mask, not a box or a hand-drawn substitute.
        result = self.Image.new("RGBA", (mask.shape[1], mask.shape[0]), (34, 197, 94, 0))
        result.putalpha(self.Image.fromarray((mask > 0).astype("uint8") * 170))
        buffer = io.BytesIO()
        result.save(buffer, format="PNG")
        return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def infer(value):
    import torch
    torch.set_num_threads(1)
    torch.set_num_interop_threads(1)
    image, grounding = decode_request(value)
    started = time.monotonic()
    segmenter = MemorySegmenter(
        "configs/sam2.1/sam2.1_hiera_b+.yaml", os.environ["PHOTOS_SAM_CHECKPOINT"],
        # The inherited constructor only ensures this directory exists; masks are in BytesIO.
        os.environ.get("TMPDIR", "/tmp"), device="cpu",
    )
    result = run_harness(image, grounding, segmenter, config=HarnessConfig())
    return {**result, "width": image.width, "height": image.height,
            "version": VERSION, "model": MODEL, "checkpointSha256": CHECKPOINT_SHA256,
            "backend": "cpu", "elapsedMs": round((time.monotonic() - started) * 1000),
            "semanticVerification": "grounding-only; no second crop-model pass",
            "autoRetry": False, "imagePersisted": False}


if __name__ == "__main__":
    try:
        payload = json.loads(sys.stdin.buffer.read(1600001))
        with redirect_stdout(sys.stderr):
            result = infer(payload)
        print(json.dumps(result, ensure_ascii=False, allow_nan=False))
    except Exception as error:
        # Never put image bytes, prompts, upstream credentials or tracebacks in logs.
        print(json.dumps({"error": "sam_inference_failed", "type": type(error).__name__}))
        sys.exit(1)
