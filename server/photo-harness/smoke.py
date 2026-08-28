"""Explicit offline/public-fixture probe; no Qwen call, no image files emitted."""
import base64
import io
import json
from pathlib import Path
import resource
import sys

from PIL import Image
from worker import infer

if __name__ == "__main__":
    image = Image.open(sys.argv[1]).convert("RGB")
    image.thumbnail((1024, 1024))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=78)
    grounding = json.loads(Path(sys.argv[2]).read_text())
    result = infer({"image": "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode(), "grounding": grounding})
    masks = []
    for region in result["regions"]:
        mask = Image.open(io.BytesIO(base64.b64decode(region["mask_uri"].split(",")[1])))
        histogram = mask.getchannel("A").histogram()
        foreground = sum(histogram[1:])
        assert 0 < foreground < image.width * image.height, "mask must have foreground and background"
        masks.append({"category": region["category"], "score": region["sam_score"], "foregroundPixels": foreground})
    assert masks, "no accepted real masks"
    print(json.dumps({"probe": "offline-public-fixture-not-live-Qwen", "version": result["version"],
                      "checkpointSha256": result["checkpointSha256"], "elapsedMs": result["elapsedMs"],
                      "maxRss": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
                      "rssUnits": "bytes" if sys.platform == "darwin" else "KiB",
                      "expected": result["expected_count"], "accepted": len(masks),
                      "rejected": len(result["rejected"]), "masks": masks}, ensure_ascii=False))
