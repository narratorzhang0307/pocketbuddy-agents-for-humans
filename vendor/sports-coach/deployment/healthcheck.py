"""Check the running service; never start a second server inside a health probe."""
import argparse
import json
import sys
import urllib.request

SPORTS = {"badminton", "basketball", "football", "volleyball", "jumprope"}


def healthy(url):
    try:
        with urllib.request.urlopen(url.rstrip("/") + "/health", timeout=5) as response:
            data = json.loads(response.read(65536))
            return (response.status == 200 and data.get("status") == "ok"
                    and data.get("rules_files", {}).get("complete") is True
                    and set(data.get("sports", [])) == SPORTS
                    and all(data.get(key) not in (None, "", "missing", "unknown")
                            for key in ("python", "numpy", "pyyaml")))
    except (OSError, ValueError, TypeError, AttributeError):
        return False


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:8000")
    args = parser.parse_args()
    ok = healthy(args.url)
    print("HEALTHY" if ok else "UNHEALTHY")
    sys.exit(0 if ok else 1)
