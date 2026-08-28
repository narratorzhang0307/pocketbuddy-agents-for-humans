#!/usr/bin/env bash
# 在线部署：本机构建 → 推送 Pocket Earth Qwen 决赛版 → pm2 原子重启。
# 只更新决赛站点 `pocketearth`，不触碰服务器上的其他 Pocket Earth 历史进程。
#
# 用法：
#   PEM=/path/to/key.pem REMOTE=root@<server-ip> ./deploy/online/deploy.sh
# 可选：
#   APP_DIR（远程目录，默认 /root/pocketearth）  APP_NAME（pm2 名，默认 pocketearth）
set -euo pipefail

PEM="${PEM:?请设置 PEM=部署私钥路径}"
REMOTE="${REMOTE:?请设置 REMOTE=root@服务器IP}"
# 不使用 `~`：环境变量赋值中的波浪号会在本机展开，再被当作远端绝对路径。
APP_DIR="${APP_DIR:-/root/pocketearth}"
APP_NAME="${APP_NAME:-pocketearth}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HER_MOTION_DIR="${HER_MOTION_DIR:-}"
HER_MOTION_PYTHON="${HER_MOTION_PYTHON:-/opt/bird-audio/.venv/bin/python}"
TONGUE_MODEL_DIR="${TONGUE_MODEL_DIR:-}"
TONGUE_PYTHON="${TONGUE_PYTHON:-/opt/bird-audio/.venv/bin/python}"
SSH=(ssh -i "$PEM" -o StrictHostKeyChecking=no)
LOCK_DIR="$ROOT/.deploy-online.lock"
STAGE_DIR=""

cleanup() {
  if [ -n "$STAGE_DIR" ] && [ -d "$STAGE_DIR" ]; then
    rm -rf -- "$STAGE_DIR"
  fi
  rmdir "$LOCK_DIR" 2>/dev/null || true
}

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "已有另一个 Pocket Earth 发布正在运行；为避免 dist 被并发构建或裁剪，本次停止。" >&2
  exit 2
fi
trap cleanup EXIT

chmod 600 "$PEM"
cd "$ROOT"

echo "==> 本机构建 dist ..."
npm run build:release

if [ -n "$HER_MOTION_DIR" ]; then
  echo "==> 构建 Her Motion 独立子应用 ..."
  test -f "$HER_MOTION_DIR/package.json"
  (cd "$HER_MOTION_DIR" && corepack pnpm install --frozen-lockfile && corepack pnpm build)
  mkdir -p "$ROOT/dist/her-motion"
  rsync -a --delete "$HER_MOTION_DIR/dist/" "$ROOT/dist/her-motion/"
fi
echo "==> 冻结本次部署快照 ..."
# dist 是共享构建目录，其他 Codex 窗口或 Android 打包可能立即重新生成它。
# 从这里开始，OSS 校验、裁剪和远程发布都只读取同一份不可变快照。
STAGE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/pocket-earth-deploy.XXXXXX")"
mkdir -p "$STAGE_DIR/dist" "$STAGE_DIR/knowledge"
rsync -a dist/ "$STAGE_DIR/dist/"
cp docs/deploy/oss-static-release-20260811.json "$STAGE_DIR/oss-release.json"
rsync -a server.mjs server "$STAGE_DIR/"
cp knowledge/travel-place-sources.mjs "$STAGE_DIR/knowledge/"
if [ -n "$HER_MOTION_DIR" ]; then
  mkdir -p "$STAGE_DIR/her-motion-service/models/yoga" "$STAGE_DIR/her-motion-service/yoga_model/runtime" "$STAGE_DIR/her-motion-service/yoga_model/config"
  cp "$HER_MOTION_DIR/models/yoga/best.pt" "$STAGE_DIR/her-motion-service/models/yoga/"
  cp "$HER_MOTION_DIR/yoga_model/runtime/"*.py "$STAGE_DIR/her-motion-service/yoga_model/runtime/"
  cp "$HER_MOTION_DIR/yoga_model/config/runtime_gate.json" "$STAGE_DIR/her-motion-service/yoga_model/config/"
fi
if [ -n "$TONGUE_MODEL_DIR" ]; then
  test -f "$TONGUE_MODEL_DIR/models/tongue/tongueexpert_multitask.ts"
  test -f "$TONGUE_MODEL_DIR/models/tongue/tongueexpert_metrics.json"
  mkdir -p "$STAGE_DIR/tongue-service"
  rsync -a --exclude '.venv' "$TONGUE_MODEL_DIR/" "$STAGE_DIR/tongue-service/"
  cp "$ROOT/server/tongue-runtime-service.py" "$STAGE_DIR/tongue-service/runtime_service.py"
fi

echo "==> 上传并校验不可变 OSS/CDN 资源 ..."
# 必须先完成全部对象的 SHA256 校验，再切换远端 index.html。
# 上传失败会因 set -e 立即停止，线上旧壳继续引用旧 release，不会出现半发布白屏。
python3 scripts/release/publish-oss-assets.py \
  --manifest "$STAGE_DIR/oss-release.json" \
  --root "$STAGE_DIR" \
  --profile "${ALIYUN_PROFILE:-pocketearth-pai}"

echo "==> 裁剪已验证上传的服务器副本 ..."
(cd "$STAGE_DIR" && node "$ROOT/scripts/release/prune-uploaded-static-assets.mjs" --manifest "$STAGE_DIR/oss-release.json")
(cd "$STAGE_DIR" && node "$ROOT/scripts/release/prune-mobile-assets.mjs")

echo "==> 推送 dist + Qwen 服务端到 $REMOTE:$APP_DIR ..."
"${SSH[@]}" "$REMOTE" "mkdir -p $APP_DIR/dist $APP_DIR/server $APP_DIR/knowledge"
# 两阶段推送，且不删旧资源（修「部署即白屏」）：
#   ① 先推 assets——新旧 hash 的 chunk 并存，挂着不刷新的旧壳照样能取到自己的 chunk；
#   ② 再推 index.html/sw.js 等——切换瞬间新壳的资源已全部就位，没有 404 窗口。
# 旧 chunk 常年累积体积很小；真要清理，手动删 30 天前的 assets 即可。
rsync -az -e "ssh -i $PEM -o StrictHostKeyChecking=no" \
  "$STAGE_DIR/dist/assets" "$REMOTE:$APP_DIR/dist/"
rsync -az -e "ssh -i $PEM -o StrictHostKeyChecking=no" \
  "$STAGE_DIR/dist" "$STAGE_DIR/server.mjs" "$STAGE_DIR/server" "$REMOTE:$APP_DIR/"
rsync -az -e "ssh -i $PEM -o StrictHostKeyChecking=no" \
  "$STAGE_DIR/knowledge/travel-place-sources.mjs" "$REMOTE:$APP_DIR/knowledge/"
if [ -n "$HER_MOTION_DIR" ]; then
  rsync -az -e "ssh -i $PEM -o StrictHostKeyChecking=no" \
    "$STAGE_DIR/her-motion-service/" "$REMOTE:$APP_DIR/her-motion-service/"
fi
if [ -n "$TONGUE_MODEL_DIR" ]; then
  rsync -az -e "ssh -i $PEM -o StrictHostKeyChecking=no" \
    "$STAGE_DIR/tongue-service/" "$REMOTE:$APP_DIR/tongue-service/"
fi

echo "==> 安装服务端运行依赖 ..."
"${SSH[@]}" "$REMOTE" "cd $APP_DIR/server && npm install --omit=dev --no-audit --no-fund"

echo "==> 远程提示 .env（首次需手动创建；只使用 DASHSCOPE_API_KEY）"
"${SSH[@]}" "$REMOTE" "[ -f $APP_DIR/.env ] && echo '已存在 .env' || echo '⚠️  $APP_DIR/.env 不存在，请先创建（见 deploy/online/README.md）'"

echo "==> pm2 拉起/重启 ..."
"${SSH[@]}" "$REMOTE" "cd $APP_DIR && (pm2 restart $APP_NAME --update-env || pm2 start server.mjs --name $APP_NAME) && (pm2 delete ${APP_NAME}-knowledge >/dev/null 2>&1 || true) && pm2 save"
if [ -n "$HER_MOTION_DIR" ]; then
  echo "==> 启动 Her Motion Yoga-82 分类服务 ..."
  "${SSH[@]}" "$REMOTE" "test -x '$HER_MOTION_PYTHON' && '$HER_MOTION_PYTHON' -c 'import torch, numpy, PIL' && (pm2 describe hermotion-yoga >/dev/null 2>&1 && pm2 restart hermotion-yoga --update-env || (cd $APP_DIR/her-motion-service && pm2 start yoga_model/runtime/server.py --name hermotion-yoga --interpreter '$HER_MOTION_PYTHON' -- --checkpoint $APP_DIR/her-motion-service/models/yoga/best.pt --config $APP_DIR/her-motion-service/yoga_model/config/runtime_gate.json --port 8765)) && pm2 save"
fi
if [ -n "$TONGUE_MODEL_DIR" ]; then
  echo "==> 启动 TonguExpert 舌苔与舌质颜色观测服务 ..."
  "${SSH[@]}" "$REMOTE" "test -x '$TONGUE_PYTHON' && '$TONGUE_PYTHON' -c 'import torch, numpy, fastapi, uvicorn, PIL' && (pm2 describe pocketearth-tongue >/dev/null 2>&1 && pm2 restart pocketearth-tongue --update-env || (cd $APP_DIR/tongue-service && pm2 start runtime_service.py --name pocketearth-tongue --interpreter '$TONGUE_PYTHON')) && pm2 save"
fi

echo "==> 远程自测："
"${SSH[@]}" "$REMOTE" "sleep 1; curl -s http://127.0.0.1:\$(grep -E '^API_PORT=' $APP_DIR/.env | cut -d= -f2)/healthz || true"
echo ""
echo "部署完成。若已配好 nginx + 证书，访问你的域名即可。"
