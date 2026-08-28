#!/bin/bash
# 练了吗 —— 启动脚本（macOS）。双击运行。
# 会同时起：模型服务(:4000) + 移动端 App(:8082)，并自动打开浏览器。
cd "$(dirname "$0")"
PROJ="$(pwd)/app_project"
export OLLAMA_MODEL="qwen2.5:3b"   # 文字教练模型（与 setup 一致）

if [ ! -d "$PROJ/.venv-model" ] || [ ! -d "$PROJ/app/node_modules" ]; then
  echo "❌ 还没安装。请先双击 setup.command 完成一次性安装。"
  read -p "按回车退出..."; exit 1
fi

echo "关闭可能已在运行的旧进程..."
pkill -f "web_app.py" 2>/dev/null || true
pkill -f "expo start" 2>/dev/null || true
sleep 1

# 启动 Ollama 文字教练服务（若已在跑则跳过）
if command -v ollama >/dev/null 2>&1; then
  if ! curl -s http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
    echo "启动 Ollama 文字教练 (:11434) ..."
    nohup ollama serve > /tmp/lianlema_ollama.log 2>&1 &
    for i in $(seq 1 15); do curl -s http://127.0.0.1:11434/api/tags >/dev/null 2>&1 && break; sleep 1; done
  fi
else
  echo "（未装 Ollama：动作打分正常，AI 文案会显示提示。可运行 setup.command 补装）"
fi

echo "启动模型服务 (:4000) ..."
cd "$PROJ"
nohup "./.venv-model/bin/python" web_app.py > /tmp/lianlema_model.log 2>&1 &

echo "启动移动端 App (:8082) ..."
cd "$PROJ/app"
# 电脑网页模式：模型地址走本机默认(127.0.0.1:4000)，摄像头锁定影石。
cat > "$PROJ/app/.env" <<ENV
EXPO_PUBLIC_MODEL_BASE_URL=
EXPO_PUBLIC_MODEL_MODE=manual
EXPO_PUBLIC_PREFERRED_CAMERA=insta360
ENV
EXPO_OFFLINE=1 nohup npx expo start --web --port 8082 > /tmp/lianlema_web.log 2>&1 &

echo "等待服务就绪（首启动稍慢）..."
OK_MODEL=0; OK_WEB=0
for i in $(seq 1 90); do
  curl -s -o /dev/null http://127.0.0.1:4000/ && OK_MODEL=1
  curl -s -o /dev/null http://localhost:8082 && OK_WEB=1
  if [ "$OK_MODEL" = 1 ] && [ "$OK_WEB" = 1 ]; then break; fi
  sleep 2
done

echo ""
if [ "$OK_MODEL" = 1 ] && [ "$OK_WEB" = 1 ]; then
  echo "✅ 已启动"
  echo "   App:      http://localhost:8082"
  echo "   模型服务: http://127.0.0.1:4000"
  echo ""
  echo "⚠️ 返回 Pocket Earth 的练了吗 Skill；插上影石相机后："
  echo "   运动 → 深蹲 → GO → 允许摄像头（会自动锁定影石 Insta360）"
else
  echo "⚠️ 启动超时。查看日志：/tmp/lianlema_model.log 与 /tmp/lianlema_web.log"
fi
echo ""
echo "关闭服务：双击 stop.command"
read -p "按回车关闭本窗口（服务会继续在后台运行）..."
