#!/usr/bin/env bash
set -euo pipefail

BASE_URL=${BASE_URL:-http://127.0.0.1:8040}

for _ in {1..90}; do
  if curl -fsS --max-time 2 "${BASE_URL}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

curl -fsS --max-time 5 "${BASE_URL}/health" >/dev/null
response=$(curl -fsS --max-time 180 \
  -H 'Content-Type: application/json' \
  -d '{"model":"qwen3-4b-local","messages":[{"role":"system","content":"你是谨慎的运动健康陪伴助手。不要诊断疾病，出现危险信号时建议停止运动并寻求专业帮助。回答不超过两句话。"},{"role":"user","content":"我今天睡眠不足而且静息心率明显高于个人基线，还适合做高强度间歇训练吗？/no_think"}],"temperature":0.2,"max_tokens":96}' \
  "${BASE_URL}/v1/chat/completions")

python3 -c '
import json, sys
data = json.load(sys.stdin)
choice = data.get("choices", [{}])[0]
content = choice.get("message", {}).get("content", "").strip()
if not content:
    raise SystemExit("Qwen response did not contain message.content")
print(content)
' <<<"${response}"
