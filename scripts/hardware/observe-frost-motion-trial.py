"""Bounded live acceptance metadata, not audio, transcripts or raw BLE data.

Usage: python observe-frost-motion-trial.py phone|serial [artifact-directory]
Create RUN/{mode}.stop to finish early. Serial never asserts DTR/RTS. Phone
console cleanup kills only this script's owned devicectl helper, not the app.
"""
import os
from pathlib import Path
import re
import selectors
import subprocess
import sys
import time

RUN = Path(sys.argv[2]) if len(sys.argv) > 2 else Path('/Volumes/PocketBuddy-iOS-Dev/Artifacts/FrostMotion-20260827')
assert RUN in (Path('/Volumes/PocketBuddy-iOS-Dev/Artifacts/FrostMotion-20260827'),
               Path('/Volumes/PocketBuddy-iOS-Dev/Artifacts/FrostMotionAuto-20260827')) and RUN.is_dir()
mode = sys.argv[1]
assert mode in ('phone', 'serial')
stop = RUN / f'{mode}.stop'
assert not stop.exists(), 'Stop marker present; inspect previous listener before restarting'
deadline = time.monotonic() + 900
log_path = RUN / f'{mode}-motion.log'


def emit(log, text):
    line = f'{time.strftime("%H:%M:%S")} {text[:700]}'
    log.write(line + '\n')
    print(line, flush=True)


with log_path.open('a', buffering=1) as log:
    os.chmod(log_path, 0o600)
    if mode == 'serial':
        import serial
        from serial.tools import list_ports
        matches = [p for p in list_ports.comports() if p.vid == 0x303A and p.pid == 0x1001 and p.serial_number == '94:A9:90:2B:39:44']
        assert len(matches) == 1 and matches[0].device == '/dev/cu.usbmodem1101'
        owned = subprocess.run(['/usr/sbin/lsof', matches[0].device], capture_output=True)
        assert owned.returncode == 1 and not owned.stdout, 'Port in use; do not take it over'
        stream = serial.Serial(port=None, baudrate=115200, timeout=0.25, exclusive=True)
        stream.dtr = False
        stream.rts = False
        stream.port = matches[0].device
        stream.open()
        pending = b''
        emit(log, 'Bounded serial metadata listener opened without reset')
        try:
            while time.monotonic() < deadline and not stop.exists():
                pending += stream.read(stream.in_waiting or 1)
                while b'\n' in pending:
                    raw, pending = pending.split(b'\n', 1)
                    line = re.sub(r'\x1b\[[0-9;]*m', '', raw.decode(errors='replace')).strip()
                    if any(word in line for word in ('frost-motion', 'Motion player', 'App version', 'Guru Meditation', 'abort() was called', 'connected (', 'disconnected (', 'manifest sent:')):
                        emit(log, line)
        finally:
            stream.close()
            emit(log, 'Serial listener closed; device left running')
    else:
        env = os.environ.copy()
        env['DEVELOPER_DIR'] = '/Volumes/PocketBuddy-iOS-Dev/Xcode.app/Contents/Developer'
        command = ['/usr/bin/xcrun', 'devicectl', 'device', 'process', 'launch', '--device',
                   '979F1007-8F1E-53F9-85CD-836378C2D071', '--terminate-existing', '--console',
                   'art.throughtheglass.pocketbuddy']
        process = subprocess.Popen(command, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        selector = selectors.DefaultSelector()
        selector.register(process.stdout, selectors.EVENT_READ)
        pending = b''
        pattern = re.compile(r'\[FrostMotion\].*|\[PocketBuddy\] FrostBadge registered.*|WebView loaded.*|Launched application.*|ERROR:.*')
        emit(log, 'Launching motion trial app; recording only trial/startup metadata')
        try:
            while process.poll() is None and time.monotonic() < deadline and not stop.exists():
                for key, _ in selector.select(0.25):
                    block = os.read(key.fileobj.fileno(), 65536)
                    if not block:
                        continue
                    pending += block
                    while b'\n' in pending:
                        raw, pending = pending.split(b'\n', 1)
                        match = pattern.search(raw.decode(errors='replace').strip())
                        if match:
                            emit(log, match.group(0))
            if process.poll() is None:
                process.kill()
                process.wait(timeout=5)
                emit(log, 'Owned console helper detached; no app terminate command sent')
            else:
                emit(log, f'Console helper exited: {process.returncode}')
        finally:
            selector.close()
            process.stdout.close()
