#!/usr/bin/env python3
"""Render exactly three existing Pi Frost motions into bounded, palette-RLE packs.

No image generation, network, credentials or firmware writes. The original Pi
renderer remains untouched. Artifacts are generated outside the application tree.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import sys
import zlib

from PIL import Image

CATALOG_SHA = "88e9162ff1a122ae68f5f010adbaf70263982b96dbe02e738ac83ba304ec57a5"
SELECTION = [(0, "sunset-playing", "日落哼唱", 12),
             (1, "jazz-playing", "爵士摇摆", 20),
             (2, "electronic-peak", "电子跳跃", 12)]
PREFIX = "pocket-earth/frost-motion/20260827-trial-v1"
BASE = "https://last-night-on-earth.oss-cn-hangzhou.aliyuncs.com/" + PREFIX
SIZE, BOX = 144, 120


def encode_frames(frames, frame_ms):
    # One shared palette prevents flicker; no dither keeps BLE payloads small.
    atlas = Image.new("RGB", (SIZE, SIZE * len(frames)))
    for i, frame in enumerate(frames):
        atlas.paste(frame, (0, SIZE * i))
    quantized = atlas.quantize(colors=64, method=Image.Quantize.MEDIANCUT,
                               dither=Image.Dither.NONE)
    palette = quantized.getpalette()[:192]
    colors = [((palette[i] >> 3) << 11) | ((palette[i + 1] >> 2) << 5) | (palette[i + 2] >> 3)
              for i in range(0, 192, 3)]
    data, offsets = bytearray(), []
    start = 20 + 128 + (len(frames) + 1) * 4
    previews = []
    for i in range(len(frames)):
        indexed = quantized.crop((0, SIZE * i, SIZE, SIZE * (i + 1)))
        pixels = indexed.tobytes()
        offsets.append(start + len(data))
        cursor = 0
        while cursor < len(pixels):
            end = cursor + 1
            while end < len(pixels) and end - cursor < 255 and pixels[end] == pixels[cursor]:
                end += 1
            data.extend((end - cursor, pixels[cursor]))
            cursor = end
        # Preview exactly the RGB565 palette decoded by the hardware.
        rgb = bytes(value for index in pixels for value in (
            ((colors[index] >> 11) & 31) * 255 // 31,
            ((colors[index] >> 5) & 63) * 255 // 63,
            (colors[index] & 31) * 255 // 31))
        previews.append(Image.frombytes("RGB", (SIZE, SIZE), rgb))
    offsets.append(start + len(data))
    payload = struct.pack("<64H", *colors) + struct.pack(f"<{len(offsets)}I", *offsets) + data
    header = struct.pack("<4s6HI", b"FMP1", SIZE, SIZE, len(frames), frame_ms, 64, 0, zlib.crc32(payload))
    return header + payload, previews


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    raw = (args.source / "frost_poses.json").read_bytes()
    if hashlib.sha256(raw).hexdigest() != CATALOG_SHA:
        raise ValueError("Source catalog changed; verify the 483-pose source before rendering")
    sys.dont_write_bytecode = True
    spec = importlib.util.spec_from_file_location("original_frost_avatar", args.source / "frost_avatar.py")
    renderer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(renderer)
    args.output.mkdir(parents=True, exist_ok=True)
    objects, items, contact = [], [], Image.new("RGB", (SIZE * 3, SIZE * 3))

    def write(name, content, content_type):
        path = args.output / name
        if path.exists() and path.read_bytes() != content:
            raise ValueError(f"Refusing to overwrite changed artifact: {path}")
        path.write_bytes(content)
        entry = {"local": name, "key": f"{PREFIX}/{name}", "bytes": len(content),
                 "sha256": hashlib.sha256(content).hexdigest(), "contentType": content_type}
        objects.append(entry)
        return entry

    for column, (slot, pose_id, label, count) in enumerate(SELECTION):
        pose = next(p for p in renderer.POSES if p["id"] == pose_id)
        body = renderer.body_tile(pose, BOX)
        bg = renderer.bg_region(pose, SIZE, SIZE, SIZE / 2, SIZE / 2 + 9, BOX)
        frame_ms = round(1000 * renderer.BASE_DUR[pose["motion"]] / pose.get("tempo", 1) / count)
        frame_ms = max(50, frame_ms)
        frames = [renderer.render_region(bg, body, pose["motion"], i / count, BOX, SIZE / 2, SIZE / 2 + 9)
                  for i in range(count)]
        data, previews = encode_frames(frames, frame_ms)
        assert len(data) <= 524288, f"Oversize motion pack: {pose_id}: {len(data)}"
        entry = write(f"{pose_id}.fmp", data, "application/octet-stream")
        items.append({"slot": slot, "id": pose_id, "label": label, "motion": pose["motion"],
                      "url": f"{BASE}/{pose_id}.fmp", "bytes": len(data), "sha256": entry["sha256"],
                      "crc32": zlib.crc32(data), "width": SIZE, "height": SIZE,
                      "frames": count, "frameMs": frame_ms})
        # Local-only QA media, not part of the upload manifest or phone bundle.
        previews[0].save(args.output / f"{pose_id}-preview.gif", save_all=True,
                         append_images=previews[1:], duration=frame_ms, loop=0, optimize=False)
        for row, index in enumerate((0, count // 4, count // 2)):
            contact.paste(previews[index], (column * SIZE, row * SIZE))
    contact.save(args.output / "contact.png")
    manifest = {"schema": "frost-motion-demo/v1", "sourceCatalogSha256": CATALOG_SHA,
                "device": "ojbadge-240x240", "storage": "volatile-psram", "items": items}
    write("manifest.json", (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode(),
          "application/json; charset=utf-8")
    release = {"schema": "pocket-earth.oss-release/v1", "release": "frost-motion-trial-v1",
               "bucket": "last-night-on-earth", "endpoint": "https://oss-cn-hangzhou.aliyuncs.com",
               "objects": objects}
    (args.output / "oss-release.json").write_text(json.dumps(release, indent=2) + "\n")
    print(json.dumps({"output": str(args.output), "manifestUrl": f"{BASE}/manifest.json",
                      "items": items, "uploadBytes": sum(o["bytes"] for o in objects)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
