#!/bin/bash
# 练了吗 —— 手机摄像头模式（真机 Expo Go 扫码）。双击运行。
# 手机用「练了吗」App 走原生手机摄像头；电脑负责跑模型服务(:4000)+文字教练。
# 手机与电脑必须连同一个 Wi‑Fi。
cd "$(dirname "$0")"
PROJ="$(pwd)/app_project"
export OLLAMA_MODEL="qwen2.5:3b"

if [ ! -d "$PROJ/.venv-model" ] || [ ! -d "$PROJ/app/node_modules" ]; then
  echo "❌ 还没安装。请先双击 setup.command 完成一次性安装。"
  read -p "按回车退出..."; exit 1
fi

# 1) 探测本机在局域网里的 IP（手机要靠它连电脑）
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null)"
[ -z "$LAN_IP" ] && LAN_IP="$(ipconfig getifaddr en1 2>/dev/null)"
[ -z "$LAN_IP" ] && LAN_IP="$(ifconfig 2>/dev/null | awk '/inet /{print $2}' | grep -v '^127\.' | head -1)"
if [ -z "$LAN_IP" ]; then
  echo "❌ 没探测到局域网 IP。请确认电脑已连 Wi‑Fi 后重试。"
  read -p "按回车退出..."; exit 1
fi
echo "本机局域网 IP：$LAN_IP"

# 2) 把模型服务地址写进 App 的 .env（手机端 fetch 用），锁定为局域网 IP
cat > "$PROJ/app/.env" <<ENV
EXPO_PUBLIC_MODEL_BASE_URL=http://$LAN_IP:4000
EXPO_PUBLIC_MODEL_MODE=manual
EXPO_PUBLIC_PREFERRED_CAMERA=insta360
ENV

echo "关闭可能已在运行的旧进程..."
pkill -f "web_app.py" 2>/dev/null || true
pkill -f "expo start" 2>/dev/null || true
sleep 1

# 3) 起 Ollama 文字教练
if command -v ollama >/dev/null 2>&1; then
  if ! curl -s http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
    echo "启动 Ollama 文字教练 (:11434) ..."
    nohup ollama serve > /tmp/lianlema_ollama.log 2>&1 &
    for i in $(seq 1 15); do curl -s http://127.0.0.1:11434/api/tags >/dev/null 2>&1 && break; sleep 1; done
  fi
else
  echo "（未装 Ollama：动作打分正常，AI 文案会显示提示。可运行 setup.command 补装）"
fi

# 4) 起模型服务（0.0.0.0:4000，手机可经局域网访问）
echo "启动模型服务 (http://$LAN_IP:4000) ..."
cd "$PROJ"
nohup "./.venv-model/bin/python" web_app.py > /tmp/lianlema_model.log 2>&1 &
for i in $(seq 1 60); do curl -s -o /dev/null "http://127.0.0.1:4000/" && break; sleep 1; done
echo "✅ 模型服务已就绪"

echo ""
echo "========================================"
echo "  手机使用步骤："
echo "  1) 手机装 Expo Go（App Store / 应用商店搜 Expo Go）"
echo "  2) 手机连和本电脑同一个 Wi‑Fi"
echo "  3) 下面会出现一个二维码——"
echo "     · iPhone：用「相机」扫码，点弹出的 Expo 链接"
echo "     · 安卓：打开 Expo Go 点 Scan QR code 扫码"
echo "  4) App 打开后进「运动」→ 选动作 → 训练页允许摄像头"
echo "  关闭：本终端窗口按 Ctrl+C，再双击 stop.command"
echo "========================================"
echo ""

# 5) 前台起 Expo（LAN 模式），二维码显示在本终端里
cd "$PROJ/app"
EXPO_OFFLINE=1 npx expo start --lan --port 8081
