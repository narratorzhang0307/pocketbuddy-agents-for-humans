#!/usr/bin/env python3
"""Create a YouTube reference or publish audio to OSS.

A YouTube URL can become an official-player reference or be pulled by the
server for a self-use pipeline validation. Local or downloaded audio is
normalized with FFmpeg, uploaded to OSS, and emitted as a pocket.music/v1
playback reference.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
from pathlib import Path, PurePosixPath
from urllib.parse import parse_qs, quote, urlparse


YOUTUBE_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")
MAX_SOURCE_BYTES = 500 * 1024 * 1024


def youtube_video_id(value: str) -> str | None:
    try:
        parsed = urlparse(value.strip())
    except ValueError:
        return None
    if parsed.scheme != "https":
        return None
    host = (parsed.hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    parts = [part for part in parsed.path.split("/") if part]
    if host == "youtu.be":
        candidate = parts[0] if parts else ""
    elif host in {"youtube.com", "m.youtube.com", "music.youtube.com"}:
        candidate = (parse_qs(parsed.query).get("v") or [""])[0]
        if not YOUTUBE_ID.fullmatch(candidate) and len(parts) >= 2 and parts[0] in {"embed", "shorts", "live"}:
            candidate = parts[1]
    else:
        return None
    return candidate if YOUTUBE_ID.fullmatch(candidate) else None


def youtube_reference(url: str) -> dict:
    video_id = youtube_video_id(url)
    if not video_id:
        raise ValueError("youtube_url_invalid")
    canonical = f"https://www.youtube.com/watch?v={video_id}"
    return {
        "mode": "youtube-reference",
        "playback": {
            "provider": "youtube",
            "url": "",
            "sourceId": video_id,
            "sourceUrl": canonical,
        },
        "delivery": "YouTube official iframe player; no media copied or cached",
    }


def run(command: list[str]) -> str:
    completed = subprocess.run(command, check=True, capture_output=True, text=True)
    return completed.stdout


def ffmpeg_executable() -> str:
    installed = shutil.which("ffmpeg")
    if installed:
        return installed
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except (ImportError, RuntimeError) as error:
        raise RuntimeError("ffmpeg_missing") from error


def ytdlp_executable() -> str:
    installed = shutil.which("yt-dlp")
    if not installed:
        raise RuntimeError("yt_dlp_missing")
    return installed


def media_duration(path: Path) -> float:
    probe = shutil.which("ffprobe")
    if probe:
        payload = json.loads(run([
            probe, "-v", "error", "-show_entries", "format=duration",
            "-of", "json", str(path),
        ]))
        return float(payload["format"]["duration"])
    inspected = subprocess.run(
        [ffmpeg_executable(), "-nostdin", "-hide_banner", "-i", str(path)],
        capture_output=True,
        text=True,
    )
    matched = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", inspected.stderr)
    if not matched:
        raise RuntimeError("audio_duration_unreadable")
    hours, minutes, seconds = matched.groups()
    return int(hours) * 3600 + int(minutes) * 60 + float(seconds)


def safe_name(value: str) -> str:
    name = re.sub(r"[^A-Za-z0-9._-]+", "-", value.strip()).strip("-._").lower()
    return name[:80] or "track"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_oss_credentials(profile_name: str) -> tuple[str, str, str | None]:
    access_key_id = os.environ.get("OSS_ACCESS_KEY_ID") or os.environ.get("ALIBABA_CLOUD_ACCESS_KEY_ID")
    access_key_secret = os.environ.get("OSS_ACCESS_KEY_SECRET") or os.environ.get("ALIBABA_CLOUD_ACCESS_KEY_SECRET")
    security_token = os.environ.get("OSS_SECURITY_TOKEN") or os.environ.get("ALIBABA_CLOUD_SECURITY_TOKEN")
    if access_key_id and access_key_secret:
        return access_key_id, access_key_secret, security_token

    config_path = Path.home() / ".aliyun" / "config.json"
    payload = json.loads(config_path.read_text())
    profile = next((item for item in payload.get("profiles", []) if item.get("name") == profile_name), None)
    if not profile:
        raise RuntimeError(f"aliyun_profile_not_found:{profile_name}")
    if profile.get("sts_expiration") and float(profile["sts_expiration"]) <= time.time() + 300:
        raise RuntimeError(f"aliyun_profile_expired:{profile_name}")
    return profile["access_key_id"], profile["access_key_secret"], profile.get("sts_token")


def upload_to_oss(path: Path, *, bucket_name: str, endpoint: str, key: str, profile: str) -> None:
    try:
        import oss2
    except ImportError as error:
        raise RuntimeError("python_package_oss2_missing") from error
    access_key_id, access_key_secret, security_token = load_oss_credentials(profile)
    auth = oss2.StsAuth(access_key_id, access_key_secret, security_token) if security_token else oss2.Auth(access_key_id, access_key_secret)
    bucket = oss2.Bucket(auth, endpoint, bucket_name, connect_timeout=120)
    headers = {
        "Content-Type": "audio/mp4",
        "Content-Disposition": "inline",
        "Cache-Control": "public, max-age=31536000, immutable",
        "x-oss-object-acl": "public-read",
        "x-oss-meta-rights-confirmed": "true",
    }
    bucket.put_object_from_file(key, str(path), headers=headers)
    remote = bucket.head_object(key)
    if int(remote.content_length) != path.stat().st_size:
        raise RuntimeError("oss_size_verification_failed")


def download_youtube_audio(url: str, destination: Path, *, max_duration: float, proxy: str) -> tuple[Path, str, dict]:
    video_id = youtube_video_id(url)
    if not video_id:
        raise ValueError("youtube_url_invalid")
    canonical = f"https://www.youtube.com/watch?v={video_id}"
    output = destination / "source.%(ext)s"
    command = [
        ytdlp_executable(), "--no-playlist", "--no-progress", "--no-update",
        "--socket-timeout", "30", "--retries", "2",
        "--match-filters", f"duration <= {int(max_duration)}",
        "--max-filesize", str(MAX_SOURCE_BYTES),
        "--ffmpeg-location", str(Path(ffmpeg_executable()).parent),
        "--format", "bestaudio/best",
        "--output", str(output),
        "--write-info-json",
        "--print", "after_move:filepath",
    ]
    if proxy:
        if not re.match(r"^(?:https?|socks5h?)://", proxy):
            raise ValueError("proxy_url_invalid")
        command += ["--proxy", proxy]
    downloaded = run([*command, canonical]).strip().splitlines()
    if not downloaded:
        raise RuntimeError("youtube_download_path_missing")
    path = Path(downloaded[-1]).resolve()
    if not path.is_file() or path.parent != destination.resolve():
        raise RuntimeError("youtube_download_failed")
    info_path = destination / "source.info.json"
    info = json.loads(info_path.read_text()) if info_path.is_file() else {}
    metadata = {
        "videoId": video_id,
        "title": str(info.get("title") or "").strip(),
        "artist": str(info.get("artist") or info.get("creator") or info.get("uploader") or "").strip(),
        "channel": str(info.get("channel") or info.get("uploader") or "").strip(),
        "durationSec": float(info.get("duration") or 0),
        "thumbnail": str(info.get("thumbnail") or "").strip(),
    }
    return path, canonical, metadata


def publish_authorized(args: argparse.Namespace) -> dict:
    if not args.rights_confirmed:
        raise ValueError("rights_confirmation_required")
    source = Path(args.input).expanduser().resolve()
    if not source.is_file():
        raise FileNotFoundError(source)
    if source.stat().st_size > MAX_SOURCE_BYTES:
        raise ValueError("source_file_too_large")
    source_url = args.source_url.strip()
    if source_url and not source_url.startswith("https://"):
        raise ValueError("source_url_must_be_https")

    duration = media_duration(source)
    if duration <= 0 or duration > args.max_duration:
        raise ValueError(f"duration_out_of_range:{duration:.3f}")

    with tempfile.TemporaryDirectory(prefix="pocket-music-") as tmp:
        normalized = Path(tmp) / "track.m4a"
        command = [
            ffmpeg_executable(), "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
            "-i", str(source), "-vn", "-c:a", "aac", "-b:a", args.bitrate,
            "-movflags", "+faststart",
        ]
        if args.title:
            command += ["-metadata", f"title={args.title}"]
        if args.artist:
            command += ["-metadata", f"artist={args.artist}"]
        command.append(str(normalized))
        run(command)

        digest = sha256_file(normalized)
        object_key = str(PurePosixPath(args.prefix.strip("/")) / digest[:16] / f"{safe_name(args.title or source.stem)}.m4a")
        public_base = args.public_base.rstrip("/") or f"https://{args.bucket}.oss-cn-hangzhou.aliyuncs.com"
        public_url = f"{public_base}/{quote(object_key, safe='/-_.~')}"
        if not args.dry_run:
            upload_to_oss(normalized, bucket_name=args.bucket, endpoint=args.endpoint, key=object_key, profile=args.profile)

        playback = {"provider": "oss", "url": public_url}
        if source_url:
            playback["sourceUrl"] = source_url
        return {
            "mode": "authorized-file-to-oss",
            "dryRun": args.dry_run,
            "rightsConfirmed": True,
            "artifact": {
                "objectKey": object_key,
                "sha256": digest,
                "bytes": normalized.stat().st_size,
                "durationSec": round(media_duration(normalized), 3),
                "codec": "AAC-LC",
                "container": "M4A",
            },
            "playback": playback,
        }


def publish_youtube(args: argparse.Namespace) -> dict:
    with tempfile.TemporaryDirectory(prefix="pocket-youtube-") as tmp:
        downloaded, canonical, source = download_youtube_audio(
            args.youtube_url,
            Path(tmp),
            max_duration=args.max_duration,
            proxy=args.proxy,
        )
        publish_args = argparse.Namespace(**vars(args))
        publish_args.input = str(downloaded)
        publish_args.source_url = canonical
        publish_args.rights_confirmed = True
        if not publish_args.title:
            publish_args.title = source["title"] or f"youtube-{youtube_video_id(canonical)}"
        if not publish_args.artist:
            publish_args.artist = source["artist"]
        result = publish_authorized(publish_args)
        result["mode"] = "youtube-to-oss"
        result.pop("rightsConfirmed", None)
        result["download"] = {"sourceUrl": canonical, "bytes": downloaded.stat().st_size}
        result["source"] = source
        return result


def add_publish_options(command: argparse.ArgumentParser) -> None:
    command.add_argument("--title", default="")
    command.add_argument("--artist", default="")
    command.add_argument("--max-duration", type=float, default=15 * 60)
    command.add_argument("--bitrate", default="192k")
    command.add_argument("--bucket", default="last-night-on-earth")
    command.add_argument("--endpoint", default="https://oss-cn-hangzhou.aliyuncs.com")
    command.add_argument(
        "--public-base",
        default=os.environ.get("MUSIC_PUBLIC_BASE", "https://assets-pocketearth.throughtheglass.art"),
        help="Public media base; the Pocket Earth asset domain preserves inline playback and byte ranges",
    )
    command.add_argument("--prefix", default="pocket-earth/user-music")
    command.add_argument("--profile", default="pocketearth-pai")
    command.add_argument("--dry-run", action="store_true")


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    commands = root.add_subparsers(dest="command", required=True)

    reference = commands.add_parser("reference", help="Create an official YouTube playback reference")
    reference.add_argument("--youtube-url", required=True)

    publish = commands.add_parser("publish", help="Normalize and upload audio the user may re-host")
    publish.add_argument("--input", required=True)
    publish.add_argument("--source-url", default="", help="Optional provenance URL; never downloaded")
    publish.add_argument("--rights-confirmed", action="store_true", help="Required: user owns or may re-host this audio")
    add_publish_options(publish)

    youtube_publish = commands.add_parser("youtube-publish", help="Pull one YouTube video and publish its audio to OSS")
    youtube_publish.add_argument("--youtube-url", required=True)
    youtube_publish.add_argument("--proxy", default="", help="Optional server-side HTTP/SOCKS proxy")
    add_publish_options(youtube_publish)
    return root


def main() -> int:
    args = parser().parse_args()
    try:
        if args.command == "reference":
            result = youtube_reference(args.youtube_url)
        elif args.command == "youtube-publish":
            result = publish_youtube(args)
        else:
            result = publish_authorized(args)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except Exception as error:
        print(json.dumps({"error": str(error), "command": args.command}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
