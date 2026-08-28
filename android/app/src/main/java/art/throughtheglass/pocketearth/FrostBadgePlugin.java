package art.throughtheglass.pocketearth;

import android.Manifest;
import android.bluetooth.*;
import android.bluetooth.le.*;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelUuid;
import android.util.Base64;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import java.io.OutputStream;
import java.util.*;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

/** Foreground BLE bridge. No microphone permission: audio originates on the physically held badge. */
@CapacitorPlugin(name = "FrostBadge", permissions = {
    @Permission(alias = "nearby", strings = {Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT}),
    @Permission(alias = "legacyScan", strings = {Manifest.permission.ACCESS_FINE_LOCATION})
})
public class FrostBadgePlugin extends Plugin {
    private static final UUID IDENTITY = UUID.fromString("ab883c83-3fcc-4a0f-a951-e18d0c944da4");
    private static UUID uuid(String shortId) { return UUID.fromString("0000" + shortId + "-0000-1000-8000-00805f9b34fb"); }
    private static final UUID CONTROL = uuid("ffc0"), COMMAND = uuid("ffc1"), EVENTS = uuid("ffc4"), VOICE_SERVICE = uuid("ffa0"), VOICE = uuid("ffa1"), CCC = uuid("2902");
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService audioWorker = Executors.newSingleThreadExecutor();
    private final AtomicBoolean playing = new AtomicBoolean(false);
    private final AtomicInteger audioGeneration = new AtomicInteger(0);
    private final Map<String, ScanResult> discovered = new LinkedHashMap<>();
    private BluetoothLeScanner scanner;
    private volatile BluetoothGatt gatt;
    private volatile BluetoothSocket audioSocket;
    private PluginCall scanCall, connectCall, writeCall;
    private BluetoothGattCharacteristic command;
    private final ArrayDeque<BluetoothGattCharacteristic> subscriptions = new ArrayDeque<>();
    private int mtu = 23;
    private volatile boolean ready = false;

    private BluetoothAdapter adapter() {
        BluetoothManager manager = (BluetoothManager)getContext().getSystemService(android.content.Context.BLUETOOTH_SERVICE);
        return manager == null ? null : manager.getAdapter();
    }
    @PluginMethod public void scan(PluginCall call) {
        String permission = Build.VERSION.SDK_INT >= 31 ? "nearby" : "legacyScan";
        if (getPermissionState(permission) != PermissionState.GRANTED) {
            requestPermissionForAlias(permission, call, "scanPermission"); return;
        }
        main.post(() -> beginScan(call));
    }
    @PermissionCallback private void scanPermission(PluginCall call) {
        String permission = Build.VERSION.SDK_INT >= 31 ? "nearby" : "legacyScan";
        if (getPermissionState(permission) != PermissionState.GRANTED) { call.reject("请允许附近设备/蓝牙扫描权限"); return; }
        main.post(() -> beginScan(call));
    }
    private void beginScan(PluginCall call) {
        if (scanCall != null || connectCall != null || gatt != null) { call.reject("请先断开当前连接或等待扫描结束"); return; }
        try {
            BluetoothAdapter a = adapter();
            if (a == null || !a.isEnabled()) { call.reject("请先打开手机蓝牙"); return; }
            scanner = a.getBluetoothLeScanner();
            if (scanner == null) { call.reject("手机不支持 BLE 扫描"); return; }
            discovered.clear(); scanCall = call;
            scanner.startScan(Collections.singletonList(new ScanFilter.Builder().setServiceUuid(new ParcelUuid(IDENTITY)).build()),
                new ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(), scanCallback);
            main.postDelayed(() -> { if (scanCall == call) finishScan(null); }, 7000);
        } catch (Exception e) { finishScan(e.getMessage()); }
    }
    private final ScanCallback scanCallback = new ScanCallback() {
        @Override public void onScanResult(int type, ScanResult result) { main.post(() -> {
            if (scanCall == null) return;
            String name = result.getScanRecord() == null ? null : result.getScanRecord().getDeviceName();
            if ("Frost-OJBadge".equals(name)) discovered.put(result.getDevice().getAddress(), result);
        }); }
        @Override public void onScanFailed(int code) { main.post(() -> finishScan("蓝牙扫描失败：" + code)); }
    };
    private void finishScan(String error) {
        try { if (scanner != null) scanner.stopScan(scanCallback); } catch (SecurityException ignored) { }
        PluginCall call = scanCall; scanCall = null;
        if (call == null) return;
        if (error != null) { call.reject(error); return; }
        JSArray devices = new JSArray();
        for (Map.Entry<String, ScanResult> entry : discovered.entrySet()) {
            JSObject d = new JSObject(); d.put("id", entry.getKey()); d.put("name", "Frost-OJBadge"); d.put("rssi", entry.getValue().getRssi()); devices.put(d);
        }
        JSObject result = new JSObject(); result.put("devices", devices); call.resolve(result);
    }
    @PluginMethod public void connect(PluginCall call) { main.post(() -> {
        if (scanCall != null || connectCall != null || gatt != null) { call.reject("蓝牙操作仍在进行"); return; }
        ScanResult target = discovered.get(call.getString("id", ""));
        if (target == null) { call.reject("请先扫描并选择吧唧"); return; }
        connectCall = call; mtu = 23; ready = false;
        try { gatt = target.getDevice().connectGatt(getContext(), false, callback, BluetoothDevice.TRANSPORT_LE); }
        catch (Exception e) { close(e.getMessage()); return; }
        main.postDelayed(() -> { if (connectCall == call) close("连接超时，请检查吧唧是否被电脑占用"); }, 20000);
    }); }
    private final BluetoothGattCallback callback = new BluetoothGattCallback() {
        @Override public void onConnectionStateChange(BluetoothGatt source, int status, int state) { main.post(() -> {
            if (source != gatt) return;
            if (status != BluetoothGatt.GATT_SUCCESS || state == BluetoothProfile.STATE_DISCONNECTED) { close("蓝牙已断开（" + status + "）"); return; }
            if (state == BluetoothProfile.STATE_CONNECTED && !source.discoverServices()) close("无法发现蓝牙服务");
        }); }
        @Override public void onServicesDiscovered(BluetoothGatt source, int status) { main.post(() -> {
            if (source != gatt) return;
            if (status != BluetoothGatt.GATT_SUCCESS) { close("服务发现失败"); return; }
            BluetoothGattService service = source.getService(CONTROL), voice = source.getService(VOICE_SERVICE);
            if (service == null || voice == null) { close("设备不是支持的 Agent_link 吧唧"); return; }
            command = service.getCharacteristic(COMMAND);
            BluetoothGattCharacteristic event = service.getCharacteristic(EVENTS), mic = voice.getCharacteristic(VOICE);
            if (command == null || event == null || mic == null) { close("设备缺少必要的 BLE 通道"); return; }
            subscriptions.clear(); subscriptions.add(command); subscriptions.add(event); subscriptions.add(mic);
            source.requestConnectionPriority(BluetoothGatt.CONNECTION_PRIORITY_HIGH);
            if (!source.requestMtu(247)) subscribeNext();
        }); }
        @Override public void onMtuChanged(BluetoothGatt source, int value, int status) { main.post(() -> {
            if (source != gatt) return;
            if (status == BluetoothGatt.GATT_SUCCESS) mtu = value;
            subscribeNext();
        }); }
        @Override public void onDescriptorWrite(BluetoothGatt source, BluetoothGattDescriptor descriptor, int status) { main.post(() -> {
            if (source != gatt) return;
            if (status != BluetoothGatt.GATT_SUCCESS) close("通知订阅失败"); else subscribeNext();
        }); }
        @Override public void onCharacteristicWrite(BluetoothGatt source, BluetoothGattCharacteristic c, int status) { main.post(() -> {
            if (source != gatt || writeCall == null) return;
            PluginCall call = writeCall; writeCall = null;
            if (status == BluetoothGatt.GATT_SUCCESS) call.resolve(); else call.reject("BLE 写入失败：" + status);
        }); }
        @Override public void onCharacteristicChanged(BluetoothGatt source, BluetoothGattCharacteristic c) {
            if (Build.VERSION.SDK_INT < 33) packet(source, c, c.getValue());
        }
        @Override public void onCharacteristicChanged(BluetoothGatt source, BluetoothGattCharacteristic c, byte[] value) { packet(source, c, value); }
    };
    private void subscribeNext() {
        if (gatt == null) return;
        BluetoothGattCharacteristic c = subscriptions.poll();
        if (c == null) {
            if (ready) return;
            ready = true;
            JSObject result = new JSObject(); result.put("id", gatt.getDevice().getAddress()); result.put("mtu", mtu); result.put("maxWriteBytes", mtu - 3);
            if (connectCall != null) { connectCall.resolve(result); connectCall = null; }
            JSObject event = new JSObject(); event.put("connected", true); notifyListeners("connection", event); return;
        }
        BluetoothGattDescriptor d = c.getDescriptor(CCC);
        if (d == null || !gatt.setCharacteristicNotification(c, true)) { close("缺少通知描述符"); return; }
        boolean accepted;
        if (Build.VERSION.SDK_INT >= 33) accepted = gatt.writeDescriptor(d, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE) == BluetoothStatusCodes.SUCCESS;
        else { d.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE); accepted = gatt.writeDescriptor(d); }
        if (!accepted) close("无法启用通知");
    }
    private void packet(BluetoothGatt source, BluetoothGattCharacteristic c, byte[] bytes) {
        if (source != gatt || bytes == null) return;
        JSObject event = new JSObject(); event.put("data", Base64.encodeToString(bytes, Base64.NO_WRAP)); event.put("channel", c.getUuid().toString());
        notifyListeners("packet", event);
    }
    @PluginMethod public void write(PluginCall call) { main.post(() -> {
        if (!ready || gatt == null || command == null) { call.reject("吧唧未连接"); return; }
        if (writeCall != null) { call.reject("请串行发送控制命令"); return; }
        try {
            byte[] bytes = Base64.decode(call.getString("data", ""), Base64.DEFAULT);
            if (bytes.length < 6 || bytes.length > mtu - 3) { call.reject("控制包超出当前 MTU"); return; }
            writeCall = call;
            boolean accepted;
            if (Build.VERSION.SDK_INT >= 33) accepted = gatt.writeCharacteristic(command, bytes, BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT) == BluetoothStatusCodes.SUCCESS;
            else { command.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT); command.setValue(bytes); accepted = gatt.writeCharacteristic(command); }
            if (!accepted) { writeCall = null; call.reject("控制包未发出"); }
            main.postDelayed(() -> { if (writeCall == call) close("控制写入超时"); }, 8000);
        } catch (Exception e) { writeCall = null; call.reject(e.getMessage()); }
    }); }
    @PluginMethod public void playPcm(PluginCall call) {
        if (Build.VERSION.SDK_INT < 29) { call.reject("扬声器音频传输需要 Android 10 或更新版本"); return; }
        BluetoothGatt connectedGatt = gatt;
        if (!ready || connectedGatt == null) { call.reject("吧唧未连接"); return; }
        byte[] data;
        try { data = Base64.decode(call.getString("data", ""), Base64.DEFAULT); }
        catch (Exception e) { call.reject("无效音频"); return; }
        if (data.length == 0 || data.length > 960000 || data.length % 2 != 0) { call.reject("音频必须是 30 秒内的 16k 单声道 PCM16"); return; }
        if (!playing.compareAndSet(false, true)) { call.reject("已有音频正在播放"); return; }
        final int generation = audioGeneration.incrementAndGet();
        audioWorker.execute(() -> {
            BluetoothSocket socket = null;
            try {
                if (generation != audioGeneration.get()) throw new IllegalStateException("播放已取消");
                socket = connectedGatt.getDevice().createInsecureL2capChannel(0x81);
                audioSocket = socket;
                final BluetoothSocket opening = socket;
                main.postDelayed(() -> { if (audioSocket == opening && !opening.isConnected()) { try { opening.close(); } catch (Exception ignored) { } } }, 10000);
                socket.connect();
                OutputStream out = socket.getOutputStream();
                for (int offset = 0; offset < data.length; offset += 640) {
                    if (gatt != connectedGatt || generation != audioGeneration.get()) throw new IllegalStateException("连接已改变或播放已取消");
                    int count = Math.min(640, data.length - offset);
                    out.write(data, offset, count); out.flush();
                    Thread.sleep(20); // Match 16k PCM rate; never overrun the device's bounded queue.
                }
                call.resolve();
            } catch (Exception e) { call.reject("音频传输失败：" + e.getMessage()); }
            finally {
                try { if (socket != null) socket.close(); } catch (Exception ignored) { }
                if (audioSocket == socket) audioSocket = null;
                playing.set(false);
            }
        });
    }
    @PluginMethod public void stopAudio(PluginCall call) {
        cancelAudio(); call.resolve();
    }
    private void cancelAudio() {
        audioGeneration.incrementAndGet();
        try { if (audioSocket != null) audioSocket.close(); } catch (Exception ignored) { }
    }
    @PluginMethod public void disconnect(PluginCall call) { main.post(() -> { close("用户断开"); call.resolve(); }); }
    private void close(String reason) {
        ready = false; command = null; subscriptions.clear();
        if (scanCall != null) finishScan(reason);
        if (connectCall != null) { connectCall.reject(reason); connectCall = null; }
        if (writeCall != null) { writeCall.reject(reason); writeCall = null; }
        cancelAudio();
        BluetoothGatt old = gatt; gatt = null;
        if (old != null) { try { old.disconnect(); old.close(); } catch (SecurityException ignored) { } }
        JSObject event = new JSObject(); event.put("connected", false); event.put("reason", reason); notifyListeners("connection", event);
    }
    @Override protected void handleOnDestroy() {
        main.post(() -> close("App 已关闭")); audioWorker.shutdownNow(); super.handleOnDestroy();
    }
}
