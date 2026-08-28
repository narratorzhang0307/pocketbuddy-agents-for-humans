#!/usr/bin/env python3
"""Replay local, explicitly authorized bird fixtures through the actual native session.

Real HTTPS to the existing T5 service; BLE and UIKit are test doubles on Mac.
No microphone, speech recognition, iPhone installation, or board access.
"""
import argparse
import hashlib
import json
import plistlib
import subprocess
import wave
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--audio-root', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    parser.add_argument('--live', action='store_true', help='Send the selected local bird recordings to the existing HearNature endpoint')
    parser.add_argument('--interval', type=float, default=12, help='Seconds between requests; no automatic retries')
    parser.add_argument('--species', help='Optional one allowlisted species ID')
    args = parser.parse_args()
    if args.interval < 0:
        parser.error('interval must be nonnegative')
    repo = Path(__file__).resolve().parents[2]
    root = args.output_dir.resolve()
    root.mkdir(parents=True, exist_ok=False)
    native = repo / 'native/frost-badge/ios'
    catalog = json.loads((native / 'BirdCatalog.json').read_text())
    by_name = {bird['name']: bird for bird in catalog if bird['index'] > 17}
    aliases = {'普通夜莺': '普通夜鹰'}  # Source directory typo; filename is 普通夜鹰.m4a.
    fixtures = []
    for file in sorted(args.audio_root.resolve().rglob('*.m4a')):
        name = aliases.get(file.parent.name, file.parent.name)
        if name not in by_name:
            raise ValueError(f'Unmapped source species: {file.parent.name}')
        bird = by_name[name]
        if args.species and args.species != bird['id']:
            continue
        target = root / f'{len(fixtures):02d}'
        target.mkdir()
        converted = target / 'source.wav'
        subprocess.run(['afconvert', '-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', str(file), str(converted)], check=True, capture_output=True)
        with wave.open(str(converted)) as audio:
            assert (audio.getframerate(), audio.getnchannels(), audio.getsampwidth()) == (16000, 1, 2)
            original_duration = audio.getnframes() / 16000
            pcm = audio.readframes(min(audio.getnframes(), 16000 * 10))
        converted.unlink()  # Only our generated intermediate; source recordings are untouched.
        if len(pcm) < 80000:
            raise ValueError(f'Fixture is shorter than 2.5 seconds: {file.name}')
        path = target / 'source.pcm'
        path.write_bytes(pcm)
        fixtures.append({'file': str(file.relative_to(args.audio_root.resolve())), 'expected': bird['id'], 'name': name,
                         'sourceSha256': hashlib.sha256(file.read_bytes()).hexdigest(), 'originalSeconds': original_duration,
                         'pcmBytes': len(pcm), 'pcmSha256': hashlib.sha256(pcm).hexdigest(), 'pcmPath': str(path)})
    if not fixtures:
        raise ValueError('No matching recordings')
    fixture_path = root / 'fixtures.json'
    fixture_path.write_text(json.dumps(fixtures, ensure_ascii=False, indent=2))
    app = root / 'BirdReplay.app/Contents'
    (app / 'Resources').mkdir(parents=True)
    (app / 'MacOS').mkdir()
    (app / 'Info.plist').write_bytes(plistlib.dumps({'CFBundleIdentifier': 'art.throughtheglass.bird-session-replay', 'CFBundleExecutable': 'BirdReplay', 'CFBundlePackageType': 'APPL'}))
    (app / 'Resources/BirdCatalog.json').write_bytes((native / 'BirdCatalog.json').read_bytes())
    source = (native / 'FrostBirdSession.swift').read_text()
    assert source.count('import UIKit\n') == 1
    adapted = root / 'FrostBirdSession.mac-test.swift'
    adapted.write_text(source.replace('import UIKit\n', ''))
    swiftc = subprocess.check_output(['xcrun', '--find', 'swiftc'], text=True).strip()
    sdk = subprocess.check_output(['xcrun', '--sdk', 'macosx', '--show-sdk-path'], text=True).strip()
    binary = app / 'MacOS/BirdReplay'
    replay = repo / 'native/frost-badge/tests/BirdSessionReplay.swift'
    subprocess.run([swiftc, '-sdk', sdk, '-target', 'arm64-apple-macosx15.0', '-module-cache-path', str(root / 'modules'),
                    '-parse-as-library', str(native / 'FrostBirdProtocol.swift'), str(adapted), str(replay), '-o', str(binary)], check=True)
    (root / 'build-receipt.json').write_text(json.dumps({'fixtures': len(fixtures), 'liveRequested': args.live,
        'sourceSha256': hashlib.sha256(source.encode()).hexdigest(), 'protocolSha256': hashlib.sha256((native / 'FrostBirdProtocol.swift').read_bytes()).hexdigest(),
        'harnessSha256': hashlib.sha256(replay.read_bytes()).hexdigest(), 'onlyProductionSourceTransformation': 'remove import UIKit; use explicit Mac test double',
        'iphoneTest': False, 'hardwareMicTest': False, 'physicalBleTest': False, 'asrTest': False, 'lockscreenTest': False}, indent=2))
    print(f'PREPARED {len(fixtures)} files; no source audio modified', flush=True)
    if args.live:
        subprocess.run([str(binary), str(fixture_path), str(root / 'native-session-results.json'), str(args.interval)], check=True)


if __name__ == '__main__':
    main()
