"""Atomically replace only the hosted coach UI; retain the previous tree for rollback.

Run on the existing Pocket Buddy Linux server after uploading a verified export.
No model service, main app, process, secret, Nginx setting or user data is changed.
RENAME_EXCHANGE: https://man7.org/linux/man-pages/man2/rename.2.html
"""
import argparse
import ctypes
import fcntl
import hashlib
import json
from pathlib import Path
import re
import shutil
import urllib.request


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def exchange(left, right):
    libc = ctypes.CDLL(None, use_errno=True)
    rename = libc.renameat2
    rename.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    rename.restype = ctypes.c_int
    if rename(-100, str(left).encode(), -100, str(right).encode(), 2):
        raise OSError(ctypes.get_errno(), "Atomic coach UI exchange failed; active files were not replaced")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("release_id")
    parser.add_argument("expected_main_release")
    parser.add_argument("expected_index_sha256")
    parser.add_argument("--rollback", action="store_true")
    args = parser.parse_args()
    if not re.fullmatch(r"[a-zA-Z0-9-]{1,90}", args.release_id):
        raise ValueError("Invalid release ID")
    root = Path("/root/pocketbuddy")
    release = root / "coach-web" / "releases" / args.release_id
    expected = Path(args.expected_main_release)
    if expected.parent != root / "releases" or not re.fullmatch(r"[a-zA-Z0-9-]+", expected.name):
        raise ValueError("Unexpected main release")
    with (root / "coach-web" / "deploy.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if (root / "current").resolve() != expected:
            raise RuntimeError("Another task changed the main release; refusing promotion")
        target = expected / "dist" / "lianlema"
        if target.is_symlink() or not target.is_dir() or digest(target / "index.html") != args.expected_index_sha256:
            raise RuntimeError("Active coach UI changed or has an unexpected type; refusing overwrite")
        previous = release / "previous"
        if args.rollback:
            receipt = json.loads((release / "receipt.json").read_text())
            if digest(previous / "index.html") != receipt["previous_index_sha256"]:
                raise RuntimeError("Rollback tree failed validation")
            exchange(previous, target)
            print(json.dumps({"rolled_back": True, "active_index_sha256": digest(target / "index.html")}))
            return
        web = release / "web"
        manifest = json.loads((release / "manifest.json").read_text())
        actual = {}
        for path in sorted(web.rglob("*")):
            if path.is_symlink():
                raise ValueError("Symlinks are not permitted in coach exports")
            if path.is_file():
                rel = path.relative_to(web).as_posix()
                if any(part.startswith(".") for part in path.relative_to(web).parts):
                    raise ValueError("Private dotfiles are not permitted")
                actual[rel] = digest(path)
        if actual != manifest["files"] or not actual.get("index.html"):
            raise RuntimeError("Uploaded export does not match its SHA256 manifest")
        if previous.exists() or (release / "receipt.json").exists():
            raise RuntimeError("This release was already promoted; choose a fresh release ID")
        shutil.copytree(web, previous)  # new unique destination, never merge with old chunks
        if (root / "current").resolve() != expected or digest(target / "index.html") != args.expected_index_sha256:
            raise RuntimeError("Active deployment changed before exchange; refusing promotion")
        exchange(previous, target)
        try:
            with urllib.request.urlopen("http://127.0.0.1:3020/lianlema/", timeout=10) as response:
                if hashlib.sha256(response.read()).hexdigest() != actual["index.html"]:
                    raise RuntimeError("Served HTML does not match the candidate")
        except Exception:
            exchange(previous, target)
            raise
        receipt = {"release_id": args.release_id, "main_release": str(expected), "active": str(target),
                   "backup": str(previous), "previous_index_sha256": args.expected_index_sha256,
                   "active_index_sha256": actual["index.html"], "files_verified": len(actual)}
        (release / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
        print(json.dumps(receipt))


if __name__ == "__main__":
    main()
