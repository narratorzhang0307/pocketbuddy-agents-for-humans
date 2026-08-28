import base64
import io
import unittest

from PIL import Image
from food_harness import run_harness
from grounding import parse_grounding_json
from worker import decode_request, MemorySegmenter


def grounding():
    return {"scene_type": "food", "expected_count": 1, "items": [{"region_id": "../../private",
            "category": "食物", "bbox_norm": [100, 100, 900, 900], "positive_point_norm": [500, 500], "confidence": .9}]}


def photo(size=(32, 32)):
    data = io.BytesIO()
    Image.new("RGB", size, "red").save(data, "PNG")
    return "data:image/png;base64," + base64.b64encode(data.getvalue()).decode()


class WorkerTests(unittest.TestCase):
    def test_bounded_real_image_and_server_generated_id(self):
        image, value = decode_request({"image": photo(), "grounding": grounding()})
        self.assertEqual(image.size, (32, 32))
        self.assertEqual(value["items"][0]["region_id"], "r001")

    def test_rejects_urls_corruption_and_large_dimensions(self):
        for value in ("https://example.com/private.jpg", "data:image/png;base64,broken", photo((1025, 8))):
            with self.assertRaises((ValueError, OSError)):
                decode_request({"image": value, "grounding": grounding()})
        with self.assertRaises(ValueError):
            decode_request([])

    def test_rejects_nonfinite_and_outside_point(self):
        for coord in (True, float("nan"), float("inf"), -1, 1001):
            value = grounding()
            value["items"][0]["bbox_norm"][0] = coord
            with self.assertRaises(ValueError):
                parse_grounding_json(value)
        value = grounding()
        value["items"][0]["positive_point_norm"] = [0, 0]
        with self.assertRaises(ValueError):
            parse_grounding_json(value)

    def test_score_gate_and_no_automatic_retry(self):
        class Segmenter:
            def __call__(self, **kwargs): return {"score": .79, "mask_uri": "not-used"}
            def retry(self, **kwargs): raise AssertionError("must not retry")
        result = run_harness(Image.new("RGB", (32, 32)), grounding(), Segmenter())
        self.assertEqual(result["status"], "needs_review")
        self.assertEqual(result["regions"], [])
        self.assertEqual(result["rejected"][0]["reason"], "sam_score_low")

    def test_mask_is_encoded_in_memory_with_actual_alpha(self):
        import numpy as np
        segmenter = MemorySegmenter.__new__(MemorySegmenter)
        segmenter.Image = Image
        pixels = np.zeros((16, 16), dtype="uint8")
        pixels[3:7, 5:10] = 255
        result = segmenter._save_mask(pixels, "must-not-write.png")
        mask = Image.open(io.BytesIO(base64.b64decode(result.split(",")[1])))
        self.assertEqual(mask.getchannel("A").histogram()[170], 20)
        self.assertEqual(mask.getpixel((0, 0))[3], 0)


if __name__ == "__main__":
    unittest.main()
