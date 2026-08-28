"""Extract two annotated MM-Fit sets without downloading the whole dataset.

Source: https://mmfit.github.io/ and https://zenodo.org/records/7672767 (CC BY 4.0).
Uses bounded HTTP ranges for labels and FFmpeg HTTP seeking for the RGB subclips.
Samples are local test inputs, not public app assets or model-training data.
"""
import argparse
import csv
import hashlib
import io
import json
from pathlib import Path
import subprocess
import ssl
import urllib.request
import zipfile
import certifi

URL = "https://s3.eu-west-2.amazonaws.com/vradu.uk/mm-fit.zip"
VIDEO_URL = "https://zenodo.org/api/records/7672767/files/w19_rgb.mp4/content"


class RemoteArchive(io.RawIOBase):
    def __init__(self, url=URL):
        self.url = url
        self.position = 0
        self.received = 0
        with self.fetch(0, 0) as response:
            self.size = int(response.headers["Content-Range"].split("/")[-1])

    def fetch(self, start, end):
        response = urllib.request.urlopen(urllib.request.Request(self.url, headers={"Range": f"bytes={start}-{end}"}),
                                          context=ssl.create_default_context(cafile=certifi.where()), timeout=25)
        if response.status != 206:
            response.close()
            raise RuntimeError("Server ignored the range; refusing a full archive download")
        return response

    def seekable(self):
        return True

    def tell(self):
        return self.position

    def seek(self, offset, whence=0):
        self.position = offset if whence == 0 else self.position + offset if whence == 1 else self.size + offset
        if self.position < 0 or self.position > self.size:
            raise ValueError("Invalid archive offset")
        return self.position

    def read(self, count=-1):
        count = self.size - self.position if count < 0 else min(count, self.size - self.position)
        if count == 0:
            return b""
        if count > 8 * 1024 * 1024 or self.received + count > 40 * 1024 * 1024:
            raise ValueError("Sample download exceeded the bounded transfer budget")
        with self.fetch(self.position, self.position + count - 1) as response:
            content = response.read(count + 1)
        if len(content) != count:
            raise RuntimeError("Incomplete or oversized HTTP range")
        self.position += count
        self.received += count
        return content


def main():
    import imageio_ffmpeg
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    destination = args.destination.resolve()
    if not destination.parent.is_dir():
        raise ValueError("Destination parent must already exist (check that the external disk is mounted)")
    destination.mkdir(exist_ok=False)
    source = RemoteArchive()
    samples = []
    with zipfile.ZipFile(source) as archive:
        labels = archive.read("mm-fit/w19/w19_labels.csv")
    (destination / "w19_labels.csv").write_bytes(labels)
    rows = list(csv.reader(io.StringIO(labels.decode())))
    for category, exercise in [("squats", "squat"), ("pushups", "push_up")]:
        row = next(row for row in rows if row[3] == category)
        # Dataset video is 30fps; include 0.75s on either side to preserve start/end posture.
        start = max(0, int(row[0]) / 30 - 0.75)
        duration = (int(row[1]) - int(row[0]) + 1) / 30 + 1.5
        playable = destination / f"mmfit-w19-{category}-first-set.mp4"
        print(json.dumps({"extracting": playable.name, "start_seconds": start, "duration_seconds": duration}), flush=True)
        subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-hide_banner", "-loglevel", "error", "-n",
                        "-protocol_whitelist", "file,http,https,tcp,tls,crypto,httpproxy",
                        "-tls_verify", "1", "-ca_file", certifi.where(), "-rw_timeout", "20000000", "-ss", str(start),
                        "-i", VIDEO_URL, "-t", str(duration), "-an", "-vf", "scale=640:-2", "-c:v", "libx264",
                        "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(playable)], check=True, timeout=180)
        frames = imageio_ffmpeg.read_frames(str(playable))
        metadata = next(frames)
        frames.close()
        samples.append({"dataset": "MM-Fit", "workout": "w19", "exercise": exercise,
                        "file": playable.name, "duration": metadata["duration"], "size": playable.stat().st_size,
                        "source_start_seconds": start, "annotation_frames": [int(row[0]), int(row[1])],
                        "annotated_reps": int(row[2]), "padding_seconds": 0.75,
                        "mp4_sha256": hashlib.sha256(playable.read_bytes()).hexdigest()})
        print(json.dumps(samples[-1]), flush=True)
    record = {"archive": URL, "video": VIDEO_URL, "source": "https://zenodo.org/records/7672767",
              "license": "CC-BY-4.0", "citation": "Stromback, Huang, Radu (2020), MM-Fit, DOI:10.1145/3432701",
              "selection": "First annotated squat and pushup sets in w19, chosen before inference; no accuracy-based filtering",
              "note": "Annotations count the full set. Verify timestamp alignment visually. Two sets are not a dataset-wide accuracy evaluation.",
              "labels_downloaded_bytes": source.received, "samples": samples}
    (destination / "samples.json").write_text(json.dumps(record, indent=2) + "\n")
    print(json.dumps({"labels_downloaded_bytes": source.received, "samples": len(samples)}))


if __name__ == "__main__":
    main()
