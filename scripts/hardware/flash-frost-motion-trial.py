"""Guarded app-only update for the explicitly selected OJBadge, 2026-08-27.

Pins immutable candidate and rollback images; refuses an unexpected board,
current app, occupied port, missing factory backup, or changed partition table.
"""
from pathlib import Path
import hashlib
import json
import subprocess
import sys
from serial.tools import list_ports

BASE = Path('/Users/zhangcheng/.local/share/pocketbuddy-esp')
RUN = Path('/Volumes/PocketBuddy-iOS-Dev/Artifacts/FrostMotion-20260827')
CANDIDATE = RUN / 'candidate/agent_link.bin'
PREVIOUS = BASE / 'capture-delivery-0.2.10/candidate/agent_link.bin'
EXPECTED = '187eaa382694fb66bb8603c082ba19156670fdcc89bce30cf8eeb0e93946dec7'
OLD_SHA = '44d13ed73ce19f692918730e686a2f9874304509bde4dc9c8d740351d2796819'
PORT = '/dev/cu.usbmodem1101'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


assert not (RUN / 'flash-record.json').exists(), 'Already flashed; inspect existing record before another update'
assert sha(CANDIDATE) == EXPECTED, 'Candidate differs from tested build'
assert sha(PREVIOUS) == OLD_SHA, 'Rollback image changed'
matches = [p for p in list_ports.comports() if p.vid == 0x303A and p.pid == 0x1001 and p.serial_number == '94:A9:90:2B:39:44']
assert len(matches) == 1 and matches[0].device == PORT, 'Target board identity changed'
owned = subprocess.run(['/usr/sbin/lsof', PORT], capture_output=True)
assert owned.returncode == 1 and not owned.stdout, 'Serial port is already in use'
factory = Path((BASE / 'current-backup-path.txt').read_text().strip())
if factory.is_dir():
    factory /= 'factory-full-16MiB.bin'
assert sha(factory) == '3d20126242812d79f12496da722ac85ede98b2f48a3de21e6205b7269f7e954f', 'Factory backup changed'
command = [sys.executable, '-m', 'esptool', '--chip', 'esp32s3', '--port', PORT,
           '--baud', '460800', '--before', 'default_reset', '--after', 'hard_reset']


def invoke(name, args):
    log = RUN / (name + '.log')
    with log.open('x') as out:
        result = subprocess.run(command + args, stdout=out, stderr=subprocess.STDOUT)
    if result.returncode:
        print(log.read_text()[-2500:], flush=True)
        raise SystemExit(f'{name} failed; no subsequent steps run')
    print(f'PASS {name}', flush=True)
    return log.read_text()


identity = invoke('board-identity', ['read_mac'])
assert '94:a9:90:2b:39:44' in identity.lower()
invoke('verify-before-0.2.10', ['verify_flash', '0x10000', str(PREVIOUS)])
partition = RUN / 'live-partition-before.bin'
invoke('read-partition-before', ['read_flash', '0x8000', '0x1000', str(partition)])
table = (RUN / 'candidate/partition-table.bin').read_bytes()
assert partition.read_bytes()[:len(table)] == table, 'Partition differs; refusing app-only write'
assert len(CANDIDATE.read_bytes()) < 0x400000, 'Application too large for existing partition'
invoke('flash-motion-0.2.11', ['write_flash', '--flash_mode', 'dio', '--flash_size', '16MB',
                            '--flash_freq', '80m', '0x10000', str(CANDIDATE)])
readback = RUN / 'live-app-after.bin'
invoke('read-app-after', ['read_flash', '0x10000', str(CANDIDATE.stat().st_size), str(readback)])
assert sha(readback) == EXPECTED, 'Physical flash readback hash mismatch'
after_partition = RUN / 'live-partition-after.bin'
invoke('read-partition-after', ['read_flash', '0x8000', '0x1000', str(after_partition)])
assert after_partition.read_bytes() == partition.read_bytes(), 'Partition changed'
record = dict(version='0.2.11-ojbadge-motion', mac='94:a9:90:2b:39:44', offset='0x10000',
              sha256=EXPECTED, bytes=CANDIDATE.stat().st_size, rollback_sha256=OLD_SHA,
              old_app_verified=True, factory_backup_verified=True, partition_unchanged=True,
              physical_readback_verified=True, live_phone_motion_verified=False,
              visible_display_confirmed=False)
(RUN / 'flash-record.json').write_text(json.dumps(record, indent=2) + '\n')
print('PASS app-only flash and independent physical readback; phone/display acceptance remains pending', flush=True)
