#!/usr/bin/env python3
"""Explicit public-fixture compatibility test, NOT a microphone/phone/lockscreen test."""
import argparse
import hashlib
import json
import subprocess
import tempfile
import time
import urllib.request
import ssl
import certifi
import wave
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('--live', action='store_true', help='Explicitly send twelve public standard calls to the existing T5 server')
p.add_argument('--output', type=Path, required=True)
p.add_argument('--window-tool', type=Path, required=True, help='Compiled actual native BirdWire.modelWave test binary')
p.add_argument('--species', help='Comma separated allowlisted IDs for an explicit focused follow-up, no automatic retries')
args = p.parse_args()
catalog = json.loads(Path('src/app/lib/skill/birdCatalog.json').read_text())
results = []
images_verified = []
tls = ssl.create_default_context(cafile=certifi.where())
for bird in catalog:
    if args.species and bird['id'] not in args.species.split(','):
        continue
    with urllib.request.urlopen(bird['jpegUrl'], timeout=15, context=tls) as r:
        image = r.read(65537)
    assert len(image) == bird['bytes'] and hashlib.sha256(image).hexdigest() == bird['sha256']
    images_verified.append(bird['id'])
    if bird['index'] == 17 or not args.live:
        continue
    with tempfile.TemporaryDirectory(prefix='bird-public-fixture-') as work:
        folder = Path(work)
        with urllib.request.urlopen(bird['source']['audioUrl'], timeout=15, context=tls) as r:
            (folder / 'source.m4a').write_bytes(r.read(8 * 1024 * 1024))
        subprocess.run(['afconvert', '-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', str(folder / 'source.m4a'), str(folder / 'source.wav')], check=True, capture_output=True)
        with wave.open(str(folder / 'source.wav')) as w:
            assert w.getframerate() == 16000 and w.getnchannels() == 1 and w.getsampwidth() == 2
            (folder / 'source.pcm').write_bytes(w.readframes(min(w.getnframes(), 16000 * 10)))
        subprocess.run([str(args.window_tool.resolve()), str(folder / 'source.pcm'), str(folder / 'window.wav')], check=True, capture_output=True)
        import base64
        body = json.dumps({'format': 'wav', 'deviceId': 'ojbadge-public-fixture-test', 'audioBase64': base64.b64encode((folder / 'window.wav').read_bytes()).decode()}).encode()
        started = time.monotonic()
        try:
            req = urllib.request.Request('https://hearnature.throughtheglass.art/hardware/recognize', data=body, headers={'Content-Type': 'application/json'})
            with urllib.request.urlopen(req, timeout=25, context=tls) as r:
                reply = json.loads(r.read(65536))
            result = {'expected': bird['id'], 'matched': reply.get('matched'), 'actual': reply.get('species_id'), 'confidence': reply.get('confidence'),
                      'correct': reply.get('matched') is True and reply.get('species_id') == bird['id'], 'elapsed': round(time.monotonic() - started, 2)}
        except Exception as error:
            result = {'expected': bird['id'], 'correct': False, 'error': type(error).__name__, 'status': getattr(error, 'code', None)}
        results.append(result)
        args.output.write_text(json.dumps({'scope': 'public standard audio -> actual native preprocessing -> existing T5 backend; no hardware microphone or iPhone', 'imagesVerified': len(images_verified), 'imageIds': images_verified, 'results': results}, ensure_ascii=False, indent=2))
        print(json.dumps(result, ensure_ascii=False), flush=True)
        if result.get('status') == 429:
            print('Stopped on server rate limit; no automatic retry', flush=True)
            break
args.output.write_text(json.dumps({'scope': 'public standard audio -> actual native preprocessing -> existing T5 backend; no hardware microphone or iPhone', 'imagesVerified': len(images_verified), 'imageIds': images_verified, 'results': results}, ensure_ascii=False, indent=2))
print(json.dumps({'images': len(images_verified), 'requests': len(results), 'correct': sum(r['correct'] for r in results)}))
