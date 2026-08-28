#!/usr/bin/env python3
"""Bridge the actual Swift bird session to an explicitly selected physical B board.

Invoked by verify-bird-session.py --live --ble-python. Does not capture audio,
flash firmware, install phone software or synthesize device execution receipts.
"""
import argparse
import asyncio
import base64
import hashlib
import json
import struct
import time
import zlib
from pathlib import Path

from bleak import BleakClient, BleakScanner

IDENTITY = 'ab883c83-3fcc-4a0f-a951-e18d0c944da4'
COMMAND = '0000ffc1-0000-1000-8000-00805f9b34fb'
EVENT = '0000ffc4-0000-1000-8000-00805f9b34fb'
VOICE = '0000ffa1-0000-1000-8000-00805f9b34fb'


async def run(output, command, device_id=None):
    targets = []
    if device_id:
        # Test-only access to Bleak's macOS delegate; the lookup is the public
        # CoreBluetooth API and is restricted to a previously verified UUID.
        from bleak.backends.device import BLEDevice
        from bleak.backends.corebluetooth.CentralManagerDelegate import CentralManagerDelegate
        from Foundation import NSUUID
        manager = CentralManagerDelegate()
        await manager.wait_until_ready()
        identifier = NSUUID.alloc().initWithUUIDString_(device_id)
        if identifier is None:
            raise ValueError('Invalid verified device UUID')
        cached = manager.central_manager.retrievePeripheralsWithIdentifiers_([identifier])
        for peripheral in cached:
            if peripheral.name() != 'Frost-OJBadge' or int(peripheral.state()) != 0:
                raise RuntimeError('Cached target identity differs or is locally busy')
            targets.append(BLEDevice(peripheral.identifier().UUIDString(), peripheral.name(), (peripheral, manager)))
    if not targets:
        devices = await BleakScanner.discover(timeout=8, return_adv=True, service_uuids=[IDENTITY])
        targets = [d for d, a in devices.values() if (a.local_name or d.name) == 'Frost-OJBadge' and (not device_id or d.address == device_id)]
    if len(targets) != 1:
        raise RuntimeError(f'Expected one identified Frost-OJBadge, found {len(targets)}')
    report = {'transport': 'real Mac CoreBluetooth via Bleak', 'deviceId': targets[0].address,
              'deviceName': targets[0].name, 'firmwareFlashed': False, 'microphoneCommandsSent': False,
              'iphoneTest': False, 'uploads': [], 'decodedReceipts': [], 'audioBytesReceived': 0}
    manifest = bytearray()
    ready = asyncio.Event()
    process = None
    uploads = {}
    failures = []
    catalog_path = Path(__file__).resolve().parents[2] / 'native/frost-badge/ios/BirdCatalog.json'
    catalog = {item['index']: item for item in json.loads(catalog_path.read_text())}

    def send(value):
        if process and process.stdin and not process.stdin.is_closing():
            process.stdin.write((json.dumps(value) + '\n').encode())

    def notify(_characteristic, raw):
        if len(raw) < 6:
            failures.append('short BLE frame'); return
        version, kind, cmd, seq, length = struct.unpack('<BBBBH', raw[:6])
        if version != 1 or len(raw) != length + 6:
            failures.append('invalid BLE frame'); return
        payload = raw[6:]
        if (kind & 0x7f) == 3 and cmd == 0x18 and len(payload) >= 2:
            if payload[0] == 0:
                manifest.clear()
            manifest.extend(payload[2:])
            if payload[1]:
                try:
                    report['manifest'] = json.loads(manifest)
                    ready.set()
                except ValueError:
                    failures.append('invalid manifest')
        if kind == 3 and (cmd == 0x40 or (cmd == 0x64 and payload[:2] in (b'\x01\x03', b'\x01\x06'))):
            if cmd == 0x40:
                report['audioBytesReceived'] += max(0, len(payload) - 9)
            failures.append('unexpected physical audio event; not forwarded or uploaded')
            if process and process.returncode is None:
                process.terminate()
            return
        if kind == 3 and cmd == 0x64 and len(payload) == 10 and payload[:2] == b'\x01\x05' and payload[3] == 3:
            _, _, index, state, token, crc = struct.unpack('<BBBBHI', payload)
            report['decodedReceipts'].append({'index': index, 'token': token, 'crc32': crc, 'state': state, 'receivedAt': time.time()})
        send({'type': 'notification', 'data': base64.b64encode(raw).decode()})

    try:
        async with BleakClient(targets[0], timeout=20) as client:
            report['mtu'] = client.mtu_size
            report['deviceInfo'] = {}
            for name, suffix in [('model', '2a24'), ('serial', '2a25'), ('firmware', '2a26')]:
                uuid = f'0000{suffix}-0000-1000-8000-00805f9b34fb'
                characteristic = client.services.get_characteristic(uuid)
                if characteristic and 'read' in characteristic.properties:
                    report['deviceInfo'][name] = (await client.read_gatt_char(characteristic)).decode(errors='replace')
            for channel in (COMMAND, EVENT, VOICE):
                await client.start_notify(channel, notify)
            try:
                await asyncio.wait_for(ready.wait(), timeout=5)
            except TimeoutError:
                await client.write_gatt_char(COMMAND, struct.pack('<BBBBH', 1, 1, 0x34, 1, 0), response=True)
                await asyncio.wait_for(ready.wait(), timeout=8)
            endpoints = {item['id'] for item in report['manifest'].get('io', [])}
            if not {'bird_mode_v1', 'avatar_jpeg_v1', 'avatar_skill_v1', 'screen0'}.issubset(endpoints):
                raise RuntimeError('Connected board lacks bird return-path interfaces')
            if min(512, client.mtu_size - 3) < 244:
                raise RuntimeError('BLE MTU smaller than replay configuration')
            print('REAL BOARD CONNECTED ' + json.dumps({'name': targets[0].name, 'id': targets[0].address, 'mtu': client.mtu_size}), flush=True)
            with (output / 'native-session-stderr.log').open('xb') as errors:
                process = await asyncio.create_subprocess_exec(*command, '--ble-stdio', stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=errors)
                async for line in process.stdout:
                    try:
                        value = json.loads(line)
                    except ValueError:
                        print(line.decode().rstrip(), flush=True); continue
                    if value.get('type') != 'write':
                        print(json.dumps(value, ensure_ascii=False), flush=True); continue
                    data = base64.b64decode(value['data'], validate=True)
                    if len(data) < 6 or data[1] != 1 or data[3] < 128 or data[2] not in (0x33, 0x3d):
                        raise RuntimeError('Unexpected native command; no remote microphone start is allowed')
                    if data[2] == 0x33:
                        payload = data[6:]
                        name = payload[1:1 + payload[0]].decode()
                        args = payload[1 + payload[0]:]
                        if name not in ('bird_mode_v1', 'avatar_jpeg_v1', 'avatar_skill_v1', 'screen0', 'speaker0'):
                            raise RuntimeError('Unexpected actuator')
                        if name == 'avatar_jpeg_v1':
                            op, index, token = struct.unpack('<BBH', args[:4])
                            key = (index, token)
                            if op == 0:
                                size, crc = struct.unpack('<II', args[4:])
                                uploads[key] = {'index': index, 'token': token, 'bytes': size, 'crc32': crc, 'data': bytearray()}
                            elif op == 1:
                                item = uploads[key]
                                if struct.unpack('<I', args[4:8])[0] != len(item['data']):
                                    raise RuntimeError('Native image chunk offset mismatch')
                                item['data'].extend(args[8:])
                            elif op == 2:
                                item = uploads[key]
                                jpeg = item.pop('data')
                                item['sha256'] = hashlib.sha256(jpeg).hexdigest()
                                asset = catalog[index]
                                if len(jpeg) != asset['bytes'] or zlib.crc32(jpeg) != asset['crc32'] or item['sha256'] != asset['sha256']:
                                    raise RuntimeError('Native outgoing JPEG differs from OSS catalog')
                                report['uploads'].append(item)
                    try:
                        await client.write_gatt_char(COMMAND, data, response=True)
                        send({'type': 'written', 'id': value['id']})
                    except Exception as error:
                        send({'type': 'written', 'id': value['id'], 'error': str(error)})
                    await process.stdin.drain()
                code = await process.wait()
                if code:
                    raise RuntimeError(f'Native replay exited {code}')
            if failures:
                raise RuntimeError('; '.join(failures))
            for item in report['uploads']:
                if not any(all(receipt[key] == item[key] for key in ('index', 'token', 'crc32')) for receipt in report['decodedReceipts']):
                    raise RuntimeError('Image upload lacks matching real board decoded receipt')
            report['allUploadsHaveDecodedReceipt'] = True
            print('REAL BLE VERIFIED ' + json.dumps({'uploads': len(report['uploads']), 'decodedReceipts': len(report['decodedReceipts']), 'audioBytes': report['audioBytesReceived']}), flush=True)
    finally:
        if process and process.returncode is None:
            process.terminate()
            await process.wait()
        report['errors'] = failures
        (output / 'physical-ble-verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path, required=True)
    parser.add_argument('--device-id', help='Previously verified CoreBluetooth UUID; never guesses another device')
    parser.add_argument('command', nargs=argparse.REMAINDER)
    args = parser.parse_args()
    command = args.command[1:] if args.command[:1] == ['--'] else args.command
    if not command:
        parser.error('missing compiled replay command')
    asyncio.run(run(args.output_dir, command, args.device_id))
