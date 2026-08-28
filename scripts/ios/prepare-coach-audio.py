"""Convert the existing coach recordings offline; no TTS service or API key.

Run on the iOS build Mac: python3 scripts/ios/prepare-coach-audio.py
The badge consumes mono 16 kHz signed little-endian PCM16 over L2CAP.
"""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile
import wave

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / 'lianlema-portable/app_project/app'
OUTPUT = ROOT / 'public/assets/frost-coach-audio'


def main():
    keys = re.findall(r'(\w+):\s*require\("../../assets/audio/\1\.mp3"\)',
                      (APP / 'src/voice/coachAudio.ts').read_text())
    assert keys and len(keys) == len(set(keys)), 'Coach asset map missing or duplicated'
    OUTPUT.mkdir(parents=True, exist_ok=True)
    clips = {}
    with tempfile.TemporaryDirectory(prefix='frost-coach-') as temp:
        for key in sorted(keys):
            source = APP / f'assets/audio/{key}.mp3'
            wav = Path(temp) / f'{key}.wav'
            subprocess.run(['/usr/bin/afconvert', str(source), str(wav),
                            '-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1'], check=True)
            with wave.open(str(wav), 'rb') as reader:
                assert (reader.getnchannels(), reader.getsampwidth(), reader.getframerate()) == (1, 2, 16000)
                pcm = reader.readframes(reader.getnframes())
            assert 0 < len(pcm) <= 960000 and len(pcm) % 2 == 0, key
            digest = hashlib.sha256(pcm).hexdigest()
            filename = f'{key}-{digest[:12]}.pcm'
            (OUTPUT / filename).write_bytes(pcm)
            clips[key] = {'path': f'/assets/frost-coach-audio/{filename}', 'bytes': len(pcm),
                          'sha256': digest, 'durationMs': len(pcm) / 32,
                          'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest()}
    (OUTPUT / 'catalog.json').write_text(json.dumps(clips, ensure_ascii=False, indent=2) + '\n')
    print(f'{len(clips)} existing recordings, {sum(c["bytes"] for c in clips.values())} PCM bytes; paid API calls: 0')


if __name__ == '__main__':
    main()
