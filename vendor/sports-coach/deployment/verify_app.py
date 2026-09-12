"""Probe the deployed Pocket Buddy API with synthetic coordinates, not camera video."""
import argparse
import json
from pathlib import Path
import re

from verify import SYNTH, _get, _post


def verify_app(url):
    root = url.rstrip("/") + "/api/sports-coach"
    status, health = _get(root + "/health")
    assert status == 200 and health.get("ready") is True, "sports service not ready"
    assert health.get("protocol") == "pocket-sports-pose/v1", "unexpected protocol"
    catalog = json.loads((Path(__file__).parent.parent / "catalog.json").read_text())
    count = 0
    for sport in catalog:
        seq, _ = SYNTH[sport["id"]]
        for action in sport["actions"]:
            payload = dict(sport=sport["id"], action=action["id"], frames=seq.tolist(),
                           width=720, height=720, timestamps=[i * 1000 / 30 for i in range(len(seq))])
            status, result = _post(root + "/assess", payload)
            assert status == 200, (sport["id"], action["id"], status)
            assert result.get("protocol") == "pocket-sports-pose/v1"
            assert result.get("sport") == sport["id"] and result.get("cls_name") == action["name"]
            assert result.get("trained_classifier") is False and result.get("action_source") == "user-selected"
            assert not re.search(r"[\u3400-\u9fff]", json.dumps(result, ensure_ascii=False))
            assert (isinstance(result.get("score"), (float, int)) and 0 <= result["score"] <= 100
                    if result.get("valid") else result.get("score") is None)
            count += 1
    payload["frames"][0][0][2] = 0
    status, missing = _post(root + "/assess", payload)
    assert status == 200 and missing.get("valid") is False and missing.get("score") is None
    print(f"PASS: live app health, {count} action responses in English, and the missing-body gate.")
    print("Synthetic coordinates only; real-camera acceptance is separate.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True, help="Pocket Buddy base URL, e.g. https://your-service.run.app")
    args = parser.parse_args()
    verify_app(args.url)
