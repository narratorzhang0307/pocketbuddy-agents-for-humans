#!/usr/bin/env python3
"""Create a GPS-complete jury pack without modifying the original research pack."""

from __future__ import annotations

import csv
import hashlib
import json
import os
from datetime import datetime
from fractions import Fraction
from pathlib import Path
import shutil
import zipfile

import piexif


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "deliverables/pocket-earth-competition-photo-task-pack"
TARGET = ROOT / "deliverables/pocket-earth-competition-photo-earth-demo-pack"
ZIP = ROOT / "deliverables/Pocket-Earth-Photos-32-Earth-Demo-Pack-2026-08-13.zip"

SYNTHETIC_GPS = {
    21: (31.2304, 121.4737, "上海"),
    22: (30.2741, 120.1551, "杭州"),
    23: (35.6762, 139.6503, "东京"),
    24: (31.2989, 120.5853, "苏州"),
    25: (30.2741, 120.1551, "杭州"),
    26: (30.2741, 120.1551, "杭州"),
    27: (30.2594, 120.1648, "杭州湖滨"),
    28: (35.5494, 139.7798, "东京羽田"),
    30: (30.2431, 120.1504, "杭州西湖"),
}


def rational(value: float) -> tuple[int, int]:
    fraction = Fraction(value).limit_denominator(1_000_000)
    return fraction.numerator, fraction.denominator


def degrees(value: float):
    absolute = abs(value)
    whole = int(absolute)
    minutes_float = (absolute - whole) * 60
    minutes = int(minutes_float)
    return (whole, 1), (minutes, 1), rational((minutes_float - minutes) * 60)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def inject_gps(path: Path, latitude: float, longitude: float, date_text: str) -> None:
    exif = piexif.load(str(path))
    taken_at = datetime.fromisoformat(date_text)
    exif["GPS"] = {
        piexif.GPSIFD.GPSLatitudeRef: ("N" if latitude >= 0 else "S").encode("ascii"),
        piexif.GPSIFD.GPSLatitude: degrees(latitude),
        piexif.GPSIFD.GPSLongitudeRef: ("E" if longitude >= 0 else "W").encode("ascii"),
        piexif.GPSIFD.GPSLongitude: degrees(longitude),
        piexif.GPSIFD.GPSDateStamp: taken_at.strftime("%Y:%m:%d").encode("ascii"),
    }
    payload = piexif.insert(piexif.dump(exif), str(path))
    if payload is not None:
        path.write_bytes(payload)
    timestamp = taken_at.timestamp()
    os.utime(path, (timestamp, timestamp))


def main() -> None:
    if TARGET.exists():
        shutil.rmtree(TARGET)
    shutil.copytree(SOURCE, TARGET)
    manifest_path = TARGET / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    for item in manifest["items"]:
        index = int(item["index"])
        item["gpsSource"] = "original-exif"
        item["gpsSyntheticForDemo"] = False
        if not item.get("hasGps"):
            latitude, longitude, city = SYNTHETIC_GPS[index]
            path = TARGET / "photos" / item["filename"]
            inject_gps(path, latitude, longitude, item["demoDateTime"])
            item.update({
                "latitude": latitude,
                "longitude": longitude,
                "hasGps": True,
                "gpsSource": "synthetic-demo",
                "gpsSyntheticForDemo": True,
                "gpsDemoCity": city,
                "sha256": sha256(path),
                "bytes": path.stat().st_size,
            })
    manifest["schema"] = "pocket-earth/competition-photo-earth-demo-pack/v1"
    manifest["earthDemo"] = {
        "allPhotosHaveGps": True,
        "syntheticGpsCount": len(SYNTHETIC_GPS),
        "disclosure": "9 张原本无 GPS 的任务照片增加可追溯的比赛演示坐标；原研究包未改动。",
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    csv_path = TARGET / "manifest.csv"
    fieldnames = list(manifest["items"][0].keys())
    with csv_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for item in manifest["items"]:
            writer.writerow({key: json.dumps(value, ensure_ascii=False) if isinstance(value, (dict, list)) else value for key, value in item.items()})

    verification = {
        "schema": "pocket-earth/earth-demo-verification/v1",
        "photoCount": len(manifest["items"]),
        "gpsCount": sum(1 for item in manifest["items"] if item.get("hasGps")),
        "syntheticGpsCount": sum(1 for item in manifest["items"] if item.get("gpsSyntheticForDemo")),
        "items": [{"filename": item["filename"], "sha256": sha256(TARGET / "photos" / item["filename"]), "gpsSource": item["gpsSource"]} for item in manifest["items"]],
    }
    (TARGET / "verification.json").write_text(json.dumps(verification, ensure_ascii=False, indent=2), encoding="utf-8")
    (TARGET / "EARTH-DEMO-README.md").write_text(
        "# Pocket Earth 32 张地球演示包\n\n"
        "- 32 张都保留原演示时间线。\n"
        "- 23 张保留原包 GPS；9 张原无 GPS 照片增加可追溯的演示坐标。\n"
        "- `manifest.json` 中 `gpsSyntheticForDemo=true` 会明确标出增补项。\n"
        "- 原研究包 `pocket-earth-competition-photo-task-pack` 未被覆盖。\n",
        encoding="utf-8",
    )
    if ZIP.exists():
        ZIP.unlink()
    with zipfile.ZipFile(ZIP, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(TARGET.rglob("*")):
            if path.is_file():
                archive.write(path, Path(TARGET.name) / path.relative_to(TARGET))
    print(json.dumps({"target": str(TARGET), "zip": str(ZIP), **verification}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
