#!/bin/bash
# 练了吗 —— 一次性安装脚本（macOS Apple Silicon）
# 双击运行；需要联网。装好后双击 start.command 即可使用。
set -e
cd "$(dirname "$0")"
PKG="$(pwd)"
PROJ="$PKG/app_project"
OLLAMA_MODEL="qwen2.5:3b"   # 文字教练用的本地大模型（Chinese 友好，约 1.9GB）

echo "========================================"
echo "  练了吗 · 安装程序"
echo "========================================"

# 1) 找 Python（优先 3.12，需 >=3.11）
PY=""
for c in python3.12 python3.13 python3.11 python3.14 python3; do
  if command -v "$c" >/dev/null 2>&1; then
    ver=$("$c" -c 'import sys;print("%d.%d"%sys.version_info[:2])' 2>/dev/null || echo "0.0")
    maj=${ver%.*}; min=${ver#*.}
    if [ "$maj" = "3" ] && [ "$min" -ge 11 ] 2>/dev/null; then PY="$c"; break; fi
  fi
done
if [ -z "$PY" ]; then
  echo "❌ 未找到 Python 3.11+。请先安装：/opt/homebrew/bin/brew install python@3.12"
  echo "（没有 Homebrew 就先装：https://brew.sh）"
  read -p "按回车退出..."; exit 1
fi
echo "✅ Python: $PY ($($PY --version 2>&1))"

# 2) 检查 Node / npm
if ! command -v npm >/dev/null 2>&1; then
  echo "❌ 未找到 Node.js。请先安装：brew install node（或 https://nodejs.org 下载 LTS）"
  read -p "按回车退出..."; exit 1
fi
echo "✅ Node: $(node --version)  npm: $(npm --version)"

# 3) 创建 Python 环境并装依赖
echo ""
echo "[1/4] 创建 Python 环境并安装模型服务依赖（约 3-8 分钟，含 PyTorch）..."
rm -rf "$PROJ/.venv-model"
"$PY" -m venv "$PROJ/.venv-model"
"$PROJ/.venv-model/bin/pip" install --upgrade pip >/dev/null
"$PROJ/.venv-model/bin/pip" install -r "$PKG/requirements-mac.txt"

# 4) 装移动端依赖
echo ""
echo "[2/4] 安装移动端 App 依赖（约 2-5 分钟）..."
cd "$PROJ/app"
npm install

# 5) 放置姿态模型缓存（免首次下载）
echo ""
echo "[3/4] 部署姿态模型缓存..."
mkdir -p "$HOME/.cache/rtmlib/hub/checkpoints"
if ls "$PKG/assets_cache/rtmlib/hub/checkpoints/"*.onnx >/dev/null 2>&1; then
  cp -n "$PKG/assets_cache/rtmlib/hub/checkpoints/"*.onnx "$HOME/.cache/rtmlib/hub/checkpoints/" || true
  echo "✅ 姿态模型已就位"
else
  echo "（无内置模型缓存，首帧会自动联网下载 ~40MB）"
fi

# 6) 安装 Ollama + 拉取文字教练模型（AI 对话/纠错文案）
echo ""
echo "[4/4] 安装 Ollama 文字教练并拉取模型 $OLLAMA_MODEL（约 1.9GB，联网）..."
if ! command -v ollama >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    echo "  用 Homebrew 安装 Ollama ..."
    brew install ollama || echo "  ⚠️ Ollama 安装失败，可稍后手动：brew install ollama"
  else
    echo "  ⚠️ 未装 Ollama 且无 Homebrew。请到 https://ollama.com/download 下载安装后重跑本脚本。"
  fi
fi
if command -v ollama >/dev/null 2>&1; then
  # 后台起 ollama 服务（若已在跑则忽略）
  if ! curl -s http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
    nohup ollama serve > /tmp/lianlema_ollama.log 2>&1 &
    for i in $(seq 1 15); do curl -s http://127.0.0.1:11434/api/tags >/dev/null 2>&1 && break; sleep 1; done
  fi
  echo "  拉取模型 $OLLAMA_MODEL ..."
  ollama pull "$OLLAMA_MODEL" || echo "  ⚠️ 模型拉取失败，可稍后手动：ollama pull $OLLAMA_MODEL"
  echo "✅ 文字教练就绪"
else
  echo "  ⚠️ 跳过文字教练（未装 Ollama）。动作打分仍可正常使用；AI 文案会显示提示。"
fi

echo ""
echo "========================================"
echo "  ✅ 安装完成！"
echo "  下一步：双击 start.command 启动"
echo "========================================"
read -p "按回车关闭本窗口..."
