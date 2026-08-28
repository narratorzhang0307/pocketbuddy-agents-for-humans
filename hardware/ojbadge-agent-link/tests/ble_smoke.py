"""Real-device BLE smoke test; not the Frost App bridge. Requires bleak 3.0.1."""
import argparse
import asyncio
import json
import struct
import math
import hashlib
import time
import urllib.request
import zlib
from pathlib import Path

from bleak import BleakClient, BleakScanner

IDENTITY = "ab883c83-3fcc-4a0f-a951-e18d0c944da4"
COMMAND = "0000ffc1-0000-1000-8000-00805f9b34fb"
EVENT = "0000ffc4-0000-1000-8000-00805f9b34fb"


async def play_macos_coc(client, pcm):
    """Actual CoC downlink probe, using Bleak 3.0.1's macOS delegate (test-only private API)."""
    import objc
    from bleak.backends.corebluetooth.PeripheralDelegate import ObjcPeripheralDelegate
    loop = asyncio.get_running_loop()
    future = loop.create_future()

    def opened(_self, _peripheral, channel, error):
        def settle():
            if future.done():
                return
            if error:
                future.set_exception(RuntimeError(str(error)))
            else:
                future.set_result(channel)
        loop.call_soon_threadsafe(settle)

    selector = objc.selector(opened, selector=b'peripheral:didOpenL2CAPChannel:error:', signature=b'v@:@@@')
    objc.classAddMethods(ObjcPeripheralDelegate, [selector])
    # CoreBluetooth caches optional delegate selectors when the delegate is assigned.
    client._backend._peripheral.setDelegate_(None)
    client._backend._peripheral.setDelegate_(client._backend._delegate.objc_delegate)
    client._backend._peripheral.openL2CAPChannel_(0x81)
    channel = await asyncio.wait_for(future, 12)
    output = channel.outputStream()
    channel.inputStream().open()
    output.open()
    offset = 0
    deadline = loop.time() + len(pcm) / 32000 + 10
    try:
        while offset < len(pcm):
            if loop.time() > deadline:
                raise TimeoutError('CoC write timed out')
            if not output.hasSpaceAvailable():
                await asyncio.sleep(.02)
                continue
            part = pcm[offset:offset + 640]
            n = output.write_maxLength_(part, len(part))
            if n < 0:
                raise RuntimeError(str(output.streamError()))
            offset += n
            await asyncio.sleep(.02)
        # Diagnostic drain grace: a successful NSOutputStream write only means OS-buffered.
        # Confirm the exact device sample count from serial; this alone is not a playback receipt.
        await asyncio.sleep(2)
        print('L2CAP PCM SENT', json.dumps(dict(psm=129, bytes=offset, samples=len(pcm) // 2, sample_rate=16000)), flush=True)
    finally:
        output.close()
        channel.inputStream().close()


async def main(touch_seconds, audio=False, coc_tone=False, mic_gate=False, pcm_file=None, volume=None, play_on_touch=False, speaker_tone=False, reference_tone=False, tone_count=1, avatar_demo=False, avatar_oss=False, bird_oss=False):
    pcm = None
    if pcm_file:
        source = Path(pcm_file)
        size = source.stat().st_size
        if not 0 < size <= 960000 or size % 2:
            raise ValueError('Expected raw 16kHz mono PCM16LE, at most 30 seconds')
        pcm = source.read_bytes()
        if pcm.startswith((b'RIFF', b'ID3')):
            raise ValueError('Use the raw hello.pcm file, not WAV or MP3')
    elif coc_tone:
        values = [int(5000 * min(1, n / 160, (4799 - n) / 160) * math.sin(2 * math.pi * 660 * n / 16000)) for n in range(4800)]
        pcm = struct.pack('<4800h', *values)
    discovered = await BleakScanner.discover(
        timeout=6, return_adv=True, service_uuids=[IDENTITY]
    )
    devices = [device for device, advert in discovered.values()
               if (advert.local_name or device.name) == "Frost-OJBadge"]
    if len(devices) != 1:
        raise RuntimeError(f"Expected exactly one Frost-OJBadge, found {len(devices)}")
    replies = {}
    manifest_ready = asyncio.Event()
    touched = asyncio.Event()
    fragments = bytearray()
    expected_index = 0
    manifest = None
    touches = []
    errors = []
    battery = None
    voice_bytes = 0
    voice_sequence = 0
    capture = None
    capture_starts = 0
    captured = asyncio.Event()
    avatar_pending = None

    def notification(_characteristic, value):
        nonlocal expected_index, manifest, battery, voice_bytes, voice_sequence, capture, capture_starts
        if len(value) < 6:
            errors.append("short_frame")
            return
        version, kind, command, sequence, length = struct.unpack("<BBBBH", value[:6])
        if version != 1 or len(value) != length + 6:
            errors.append("invalid_frame")
            return
        payload = value[6:]
        if (kind & 0x7F) == 2:
            pending = replies.get(sequence)
            if pending and pending[0] == command and not pending[1].done():
                pending[1].set_result(bytes(payload))
        elif (kind & 0x7F) == 3 and command == 0x18:
            if len(payload) < 2:
                errors.append("short_manifest_fragment")
                return
            index, last = payload[:2]
            if index == 0:
                fragments.clear()
                expected_index = 0
            if index != expected_index:
                errors.append("manifest_fragment_gap")
                return
            fragments.extend(payload[2:])
            expected_index += 1
            if last:
                try:
                    manifest = json.loads(fragments)
                except (ValueError, UnicodeDecodeError):
                    errors.append("invalid_manifest_json")
                else:
                    manifest_ready.set()
        elif kind == 3 and command == 0x40 and len(payload) >= 9:
            session, seq, flags = struct.unpack('<IIB', payload[:9])
            if seq != voice_sequence:
                errors.append('voice_sequence_gap')
            voice_sequence = seq + 1
            voice_bytes += len(payload) - 9
            if capture and voice_bytes >= capture['samples'] * 2:
                captured.set()
        elif kind == 3 and command == 0x64 and payload[:2] in (b'\x01\x03', b'\x01\x06') and len(payload) == 12:
            version, event_kind, active, reason, samples, peak, dropped = struct.unpack('<BBBBIHH', payload)
            if active:
                capture_starts += 1
                voice_bytes = 0
                voice_sequence = 0
                capture = None
                print('MIC RECORDING STARTED', flush=True)
            else:
                capture = dict(reason=reason, samples=samples, peak=peak, dropped=dropped)
                print('MIC RECORDING STOPPED', json.dumps(capture), flush=True)
                if voice_bytes >= samples * 2:
                    captured.set()
        elif kind == 3 and command == 0x64 and payload[:2] == b'\x01\x02' and len(payload) == 10:
            version, event_kind, valid, percent, mv, ma, flags = struct.unpack('<BBBBHhH', payload)
            battery = dict(valid=bool(valid), percent=percent, millivolts=mv, milliamps=ma, flags=flags)
            print('BATTERY', json.dumps(battery), flush=True)
        elif kind == 3 and command == 0x64 and payload[:2] == b'\x01\x05' and len(payload) == 10:
            _version, _event, index, state, token, result = struct.unpack('<BBBBHI', payload)
            if avatar_pending:
                want_index, want_token, want_state, want_value, future = avatar_pending
                if index == want_index and token == want_token and not future.done():
                    if state == 128:
                        future.set_exception(RuntimeError(f'Avatar device rejected upload: {result}'))
                    elif state == want_state and result == want_value:
                        future.set_result(result)
        elif (kind & 0x7F) == 3 and command == 0x64 and len(payload) == 10:
            schema, event_kind, count, x, y = struct.unpack("<BBIHH", payload)
            if schema == 1 and event_kind == 1:
                touch = {"count": count, "x": x, "y": y}
                touches.append(touch)
                print("PHYSICAL TOUCH RECEIVED", json.dumps(touch), flush=True)
                touched.set()

    async with BleakClient(devices[0], timeout=20) as client:
        print("CONNECTED", json.dumps({"mtu": client.mtu_size}), flush=True)
        await client.start_notify(COMMAND, notification)
        await client.start_notify(EVENT, notification)
        if audio or mic_gate or bird_oss:
            await client.start_notify('0000ffa1-0000-1000-8000-00805f9b34fb', notification)

        async def command(command_id, sequence, payload=b""):
            future = asyncio.get_running_loop().create_future()
            replies[sequence] = (command_id, future)
            frame = struct.pack("<BBBBH", 1, 1, command_id, sequence, len(payload)) + payload
            await client.write_gatt_char(COMMAND, frame, response=True)
            result = await asyncio.wait_for(future, timeout=8)
            # SDK response payload repeats the command id, then status and LE16 error.
            if len(result) < 4 or result[0] != command_id or result[1] != 0 or result[2:4] != b"\0\0":
                raise RuntimeError(f"Command {command_id:02x} failed: {result.hex()}")
            print("COMMAND ACK", f"0x{command_id:02x}", sequence, flush=True)

        try:
            await asyncio.wait_for(manifest_ready.wait(), timeout=4)
        except TimeoutError:
            await command(0x34, 1)
            await asyncio.wait_for(manifest_ready.wait(), timeout=8)
        endpoints = {endpoint["id"] for endpoint in manifest.get("io", [])}
        required = {"screen0", "avatar_state", "touch0"}
        if not required.issubset(endpoints):
            raise RuntimeError(f"Missing required endpoints: {required - endpoints}")
        print("MANIFEST", json.dumps(manifest), flush=True)

        async def actuate(endpoint, value, sequence):
            encoded = endpoint.encode("utf-8")
            await command(0x33, sequence, bytes([len(encoded)]) + encoded + value)

        if avatar_oss or bird_oss:
            if not {'avatar_skill_v1', 'avatar_jpeg_v1'}.issubset(endpoints):
                raise RuntimeError('The connected firmware does not support OSS JPEG portraits')
            if bird_oss:
                if 'bird_mode_v1' not in endpoints:
                    raise RuntimeError('Bird mode endpoint missing')
                birds = json.loads((Path(__file__).resolve().parents[3] / 'src/app/lib/skill/birdCatalog.json').read_text())
                if [b['index'] for b in birds] != list(range(17, 30)):
                    raise RuntimeError('Unexpected bird mapping')
                catalog = [dict(id=b['id'], name=b['name'], badgeIndex=b['index'], cloud=b) for b in birds]
            else:
                catalog = json.loads((Path(__file__).resolve().parents[3] / 'public/assets/skill-avatars/20260827/catalog.json').read_text())
                if [item['badgeIndex'] for item in catalog] != list(range(17)) or catalog[0]['cloud'] is not None:
                    raise RuntimeError('Unexpected versioned portrait mapping or non-local Frost')
            endpoint = 'avatar_jpeg_v1'
            chunk_size = min(min(512, client.mtu_size - 3) - 6, 480) - 1 - len(endpoint) - 8
            if chunk_size < 4:
                raise RuntimeError('Negotiated MTU too small for portrait transfer')
            next_sequence = 20
            results = []

            async def exchange(data, state, value):
                nonlocal avatar_pending, next_sequence
                index, token = data[1], struct.unpack('<H', data[2:4])[0]
                attempts = 1 if bird_oss else 2  # Match the native bird path: no retries.
                for attempt in range(attempts):
                    future = asyncio.get_running_loop().create_future()
                    avatar_pending = (index, token, state, value, future)
                    try:
                        next_sequence = 128 + (next_sequence + 1) % 128 if bird_oss else next_sequence % 255 + 1
                        await actuate(endpoint, data, next_sequence)
                        # A command ACK alone only confirms queueing. Require the
                        # matching device processed/decoded receipt as well.
                        await asyncio.wait_for(future, timeout=2.2)
                        return
                    except TimeoutError:
                        if attempt + 1 == attempts:
                            raise
                    finally:
                        if future.done() and not future.cancelled():
                            future.exception()  # Observe failures even if command ACK failed first.
                        else:
                            future.cancel()
                        avatar_pending = None

            def download(item):
                cloud = item['cloud']
                prefix = 'bird-skill/20260828-v1/' if bird_oss else 'skill-avatars/20260828-round-v1/hardware-round/'
                expected = 'https://last-night-on-earth.oss-cn-hangzhou.aliyuncs.com/pocket-earth/' + prefix + item['id'] + '.jpg'
                if cloud['jpegUrl'] != expected or not 4 <= cloud['bytes'] <= 65536:
                    raise RuntimeError('Unexpected OSS URL or portrait size')
                with urllib.request.urlopen(expected, timeout=12) as response:
                    if response.status != 200 or response.url != expected:
                        raise RuntimeError('OSS download failed or redirected')
                    data = response.read(65537)
                if len(data) != cloud['bytes'] or hashlib.sha256(data).hexdigest() != cloud['sha256'] or zlib.crc32(data) != cloud['crc32']:
                    raise RuntimeError('OSS portrait integrity mismatch')
                return data

            await actuate('avatar_skill_v1', b'\x00', 2)
            await asyncio.sleep(.25)
            try:
                for item in (catalog if bird_oss else catalog[1:]):
                    if bird_oss:
                        await actuate('bird_mode_v1', b'\x02', 4)
                    index, cloud = item['badgeIndex'], item['cloud']
                    data = await asyncio.to_thread(download, item)
                    token = 1400 + index
                    started = time.monotonic()
                    await exchange(struct.pack('<BBHII', 0, index, token, len(data), cloud['crc32']), 1, 0)
                    for offset in range(0, len(data), chunk_size):
                        chunk = data[offset:offset + chunk_size]
                        await exchange(struct.pack('<BBHI', 1, index, token, offset) + chunk, 2, offset + len(chunk))
                    await exchange(struct.pack('<BBH', 2, index, token), 3, cloud['crc32'])
                    if bird_oss:
                        message = '长按屏幕录鸟叫\n建议六秒后松手' if index == 17 else '疑似：' + item['name'] + '\n长按屏幕再识别'
                        await actuate('screen0', message.encode(), 5)
                        await actuate('bird_mode_v1', bytes([1 if index == 17 else 3]), 6)
                    result = dict(index=index, id=item['id'], bytes=len(data), sha256=cloud['sha256'], crc32=cloud['crc32'], decoded_receipt=True, seconds=round(time.monotonic() - started, 2))
                    results.append(result)
                    print('OSS AVATAR VERIFIED', json.dumps(result, ensure_ascii=False), flush=True)
                    # Replay lost commit receipt; this must be idempotent and not
                    # start a new decode or cause an unsolicited image selection.
                    await exchange(struct.pack('<BBH', 2, index, token), 3, cloud['crc32'])
                    await asyncio.sleep(1)
                if errors:
                    raise RuntimeError(f'Protocol errors: {errors}')
                if bird_oss and (voice_bytes or capture_starts):
                    raise RuntimeError('Microphone activity during display-only bird mode check')
                print('OSS AVATAR RESULT', json.dumps(dict(avatars=results, remote_count=len(results), resident_frost=True, microphone_commands_sent=False, physical_display_seen_by_test=False)), flush=True)
                if bird_oss:
                    print('BIRD MODE GATE PASS', json.dumps(dict(capture_starts=capture_starts, voice_bytes=voice_bytes, phone_test=False, recognition_test=False)), flush=True)
            finally:
                if bird_oss:
                    await actuate('bird_mode_v1', b'\x00', 7)
                await actuate('avatar_skill_v1', b'\x00', 3)
                await asyncio.sleep(.5)
                print('FROST RESTORED', flush=True)
            return

        if avatar_demo:
            if 'avatar_skill_v1' not in endpoints:
                raise RuntimeError('The connected firmware does not support bundled skill portraits')
            if 'avatar_jpeg_v1' in endpoints:
                raise RuntimeError('This firmware only stores Frost; use --avatar-oss to test remote portraits')
            catalog = json.loads((Path(__file__).resolve().parents[3] / 'public/assets/skill-avatars/20260827/catalog.json').read_text())
            if [item['badgeIndex'] for item in catalog] != list(range(17)):
                raise RuntimeError('Unexpected versioned portrait mapping')
            if 'motion' in endpoints:
                await actuate('motion', b'\x04\x00', 2)
            await actuate('avatar_state', b'\x01', 3)
            await actuate('screen0', b'AVATAR PREVIEW', 4)
            for item in catalog:
                index = item['badgeIndex']
                await actuate('avatar_skill_v1', bytes([index]), 20 + index)
                print('AVATAR SELECTED', json.dumps({'index': index, 'id': item['id']}, ensure_ascii=False), flush=True)
                await asyncio.sleep(2)
            await actuate('avatar_skill_v1', b'\x00', 40)
            await actuate('screen0', b'HOLD BOOT TO TALK', 41)
            await asyncio.sleep(.5)
            if errors:
                raise RuntimeError(f'Protocol errors: {errors}')
            print('AVATAR RESULT', json.dumps({'commands_acknowledged': 17, 'restored_frost': True,
                  'microphone_commands_sent': False, 'physical_display_seen_by_test': False}), flush=True)
            return

        # Both packets fit even the default ATT MTU; the screen should say BLE OK.
        await actuate("screen0", b"BLE OK", 2)
        await actuate("avatar_state", b"\x04", 3)
        print("DISPLAY COMMANDS SENT: verify BLE OK and CELEBRATE on the screen", flush=True)
        if volume is not None:
            await actuate('speaker0', bytes([2, volume]), 8)
            print('SPEAKER VOLUME', volume, flush=True)
        if play_on_touch:
            if pcm is None and not speaker_tone and not reference_tone:
                raise ValueError('--play-on-touch requires a playback option')
            await actuate('screen0', b'TAP FOR TONE' if speaker_tone or reference_tone else b'TAP FOR VOICE', 9)
            touched.clear()
            print('READY: tap and release the round screen to play; no cloud call', flush=True)
            await asyncio.wait_for(touched.wait(), timeout=max(1, touch_seconds))
            await asyncio.sleep(.3)
        if speaker_tone or reference_tone:
            for tone_index in range(tone_count):
                await actuate('speaker0', b'\x03' if reference_tone else b'\x01', 10 + tone_index)
                print(f'ONBOARD TEST TONE REQUESTED {tone_index + 1}/{tone_count}: no L2CAP audio and no cloud API', flush=True)
                await asyncio.sleep(1.5 if tone_index + 1 < tone_count else 1)
        if pcm is not None:
            await play_macos_coc(client, pcm)
            await command(5, 5, struct.pack('<IB', 0, 3))
        if volume is not None and volume > 60:
            # The CoC helper has already allowed its diagnostic drain grace above.
            # Restore the startup level even before disconnect; firmware also resets
            # louder levels on stop/disconnect if an exception interrupts this path.
            await asyncio.sleep(.2)
            await actuate('speaker0', bytes([2, 25]), 12)
            await asyncio.sleep(.1)
            print('SPEAKER VOLUME RESTORED 25', flush=True)
        if mic_gate:
            await command(0x3c, 6, struct.pack('<BH', 0, 30000))
            await asyncio.sleep(1.5)
            if voice_bytes:
                raise RuntimeError('Unexpected capture during remote-only mic gate check')
            await command(0x3d, 7)
            print('MIC GATE PASS: remote request alone transmitted zero audio bytes', flush=True)
        if audio:
            await actuate('speaker0', b'\x01', 4)
            print('TEST TONE SENT; hold screen >0.6 sec, speak, release', flush=True)
        if touch_seconds and not play_on_touch:
            print("WAITING FOR PHYSICAL TOUCH", touch_seconds, "seconds", flush=True)
            try:
                await asyncio.wait_for((captured if audio else touched).wait(), timeout=touch_seconds)
            except TimeoutError:
                print("Requested physical interaction not completed during this window", flush=True)
        if audio:
            print('AUDIO RESULT', json.dumps(dict(battery=battery, capture=capture, voice_bytes=voice_bytes)), flush=True)
            if not battery or not battery['valid']:
                errors.append('valid_battery_not_received')
            if not capture or capture['samples'] == 0 or capture['samples'] * 2 != voice_bytes or capture['dropped']:
                errors.append('complete_microphone_capture_not_received')
        print("RESULT", json.dumps({"manifest": True, "commands_acknowledged": True,
                                  "touch_events": touches, "protocol_errors": errors}), flush=True)
        if errors:
            raise RuntimeError("Protocol validation errors were observed")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--touch-seconds", type=int, default=20)
    parser.add_argument('--audio', action='store_true')
    playback = parser.add_mutually_exclusive_group()
    playback.add_argument('--coc-tone', action='store_true')
    playback.add_argument('--pcm-file', help='Reuse already generated raw 16kHz mono PCM16LE; never calls a cloud API')
    parser.add_argument('--mic-gate', action='store_true')
    parser.add_argument('--volume', type=int, choices=[0, 25, 40, 60, 100], help='100 is the explicit 0dB reference level; restored to25 after the test')
    parser.add_argument('--play-on-touch', action='store_true', help='Wait for a physical tap before playing the cached PCM')
    parser.add_argument('--speaker-tone', action='store_true', help='Ask the board to generate its own short tone; no audio transfer')
    parser.add_argument('--reference-tone', action='store_true', help='Explicit 500ms 0dB DAC reference tone; normal volume is restored afterwards')
    parser.add_argument('--tone-count', type=int, choices=[1, 2], default=1, help='Explicitly request one or two onboard tones at the same level')
    parser.add_argument('--avatar-demo', action='store_true', help='Select each of the 17 built-in portraits for two seconds, then leave Frost; no audio or microphone commands')
    parser.add_argument('--avatar-oss', action='store_true', help='Download and SHA-verify 16 OSS JPEGs, require device decoded receipts, then leave Frost; no microphone commands')
    parser.add_argument('--bird-oss', action='store_true', help='Verify 13 OSS bird portraits and native-size BLE receipts; cycle bird modes without opening the microphone; not an iPhone or recognition test')
    args = parser.parse_args()
    if sum([args.avatar_demo, args.avatar_oss, args.bird_oss]) > 1:
        parser.error('Select one avatar test')
    if (args.avatar_demo or args.avatar_oss or args.bird_oss) and (args.audio or args.coc_tone or args.mic_gate or args.pcm_file or args.volume is not None or args.play_on_touch or args.speaker_tone or args.reference_tone):
        parser.error('Avatar tests cannot be combined with audio or microphone tests')
    if args.tone_count != 1 and not (args.speaker_tone or args.reference_tone):
        parser.error('--tone-count requires --speaker-tone or --reference-tone')
    asyncio.run(main(args.touch_seconds, args.audio, args.coc_tone, args.mic_gate, args.pcm_file, args.volume, args.play_on_touch, args.speaker_tone, args.reference_tone, args.tone_count, args.avatar_demo, args.avatar_oss, args.bird_oss))
