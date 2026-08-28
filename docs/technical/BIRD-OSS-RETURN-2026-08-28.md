# 识别结果 → OSS → B 板：实板回图验收

本页记录的是 v1 鸟图的实板验证。后续补回 T5 原背景的 v2 资源见 [背景发布与预检](BIRD-T5-BACKGROUNDS-2026-08-28.md)，不能把本页回执当作新版显示验收。

2026-08-28。**真实 B 板回图已通过；真实 iPhone 中转、麦克风及黑屏仍未验收。**

## 结果

- 十二种鸟各选一段用户指定的标准录音，**12/12 识别正确**。
- 每次由实际 `FrostBirdSession` 根据服务返回的 `species_id` 选取对应 OSS 图片，经真实 BLE 传给已确认身份的 B 板。
- 十二张鸟图及识鸟头像，共 **13 个图片事务、100,271 bytes，13/13 收到匹配索引、token、CRC32 的真实板端解码成功回执**。
- 板端共重复通知 99 次，按事务去重后为 13；重复通知没有重复计入通过数。
- 测试中没有采集现场录音、没有刷写固件、没有安装或操作手机。原生流程正常退出，测试客户端已断开；之后只读查询确认设备连接状态为 0（disconnected）。

单次识别及实际回图耗时中位数 4.392 秒，范围 3.831–5.511 秒；不包括实体录音或 iPhone 后台调度。

完整结果、图片 SHA256、CRC 与真实回执：[oss-return-physical-verification.json](../design/bird-skill-20260828/oss-return-physical-verification.json)。

## 产品链路与本轮边界

```mermaid
flowchart LR
    S[服务器返回鸟种] --> P[手机按白名单选择图片]
    P --> O[从阿里云 OSS 下载 JPEG]
    O --> V[校验长度 SHA256 CRC32]
    V --> B[蓝牙 begin / chunk / commit]
    B --> D[B 板校验 CRC 并解码]
    D --> R[返回匹配 token 的成功回执]
```

本轮**由 Mac 运行同一份手机原生会话代码作中转**。UIKit/后台调度仍是测试替身，音频来自标准文件；HTTP、OSS、蓝牙传输及 B 板 JPEG 解码是真实的。没有用模拟板端回执确认成功，也没有用这次结果代替手机实测。

手机不会采用服务器任意返回的图片 URL，而是用鸟种 ID 查内置的十二鸟 OSS 清单。收到 GATT 写入完成、命令 ACK、对应图片解码回执后，原生流程才发布结果。

## 实际对应关系

| 鸟种 | 板端索引 | 本轮 token | JPEG bytes | 解码回执 |
| --- | ---: | ---: | ---: | --- |
| 乌鸫 | 25 | 2 | 6,735 | 通过 |
| 喜鹊 | 26 | 3 | 7,807 | 通过 |
| 大杜鹃 | 19 | 4 | 6,755 | 通过 |
| 强脚树莺 | 23 | 5 | 7,157 | 通过 |
| 普通夜鹰 | 22 | 6 | 7,742 | 通过 |
| 棕背伯劳 | 28 | 7 | 7,122 | 通过 |
| 棕脸鹟莺 | 29 | 8 | 7,979 | 通过 |
| 珠颈斑鸠 | 27 | 9 | 8,047 | 通过 |
| 白头鹎 | 18 | 10 | 8,287 | 通过 |
| 红嘴蓝鹊 | 20 | 11 | 7,996 | 通过 |
| 鹊鸲 | 24 | 12 | 7,650 | 通过 |
| 麻雀 | 21 | 13 | 7,837 | 通过 |

识鸟头像为索引 17、token 1、9,157 bytes，同样通过真实解码回执校验。

## B 板身份与存储

目标名 `Frost-OJBadge`；USB 序列号 `94:A9:90:2B:39:44`、蓝牙 MAC `94:a9:90:2b:39:46`，与此前确认的 B 板一致。本轮采用已实际发现的 CoreBluetooth UUID `6A624635-DEB3-BFE0-C872-3800459ACA94` 连接，MTU 256；没有尝试连接其他名称的设备。

串口启动观察到版本 `0.2.19-ojbadge-frost-wink`；随后成功连接时 GATT 实际返回版本字符串 `0.2.20-ojbadge-frost-bo`，按原样保留，不推测截断后缀或变更来源。本任务未刷写固件。串口接入期间观察到 `USB_UART_CHIP_RESET` 启动日志，不能将该阶段描述成“未发生重启”。

启动日志报告 `resident=FROST only; OSS via phone`。图片接收、缓存和解码缓冲使用 PSRAM；鸟图无需预烧进固件。断开后保留原有离线 Frost 回退。

没有取得新的圆屏照片，因此不声称已经肉眼检查颜色、裁切及文字布局。

## 复现与证据

测试入口：`scripts/hardware/verify-bird-session.py`；真实蓝牙适配器：`scripts/hardware/bird-replay-ble.py`。`--ble-python` 必须配合显式 `--live`。只有经核验的设备 UUID 才可传入 `--ble-device-id`，不能猜选其他设备。

```sh
DEVELOPER_DIR=/Volumes/PocketBuddy-iOS-Dev/Xcode.app/Contents/Developer \
python3 scripts/hardware/verify-bird-session.py \
  --audio-root '/Users/zhangcheng/Desktop/杭州常见物种标准声音/鸟' \
  --output-dir '/Volumes/PocketBuddy-iOS-Dev/Artifacts/bird-return-new-run' \
  --one-per-species --live --interval 12 \
  --ble-python '/Users/zhangcheng/.local/share/pocketbuddy-esp/ble-venv/bin/python' \
  --ble-device-id '6A624635-DEB3-BFE0-C872-3800459ACA94'
```

本次私有证据目录：`/Volumes/PocketBuddy-iOS-Dev/Artifacts/bird-return-path-20260828`。包含完整样本清单、冻结原生代码及测试源码、构建 SHA、原生结果、真实 BLE 上传数据摘要与接收回执、连接释放核查。

最初按广播名称扫描失败时原生会话没有启动，也没有发送识别请求。后续使用已验证 UUID 成功连接；成功批次没有网络重试。

下一步仅需在真实手机上重复相同返回流程，并验证实体录音及锁屏；本轮没有完成这三项。
