#!/bin/sh
set -eu

# Xcode launched from Finder does not inherit the terminal's Node PATH.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
project_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
if ! command -v node >/dev/null 2>&1; then
  echo 'error: 找不到 Node.js，无法验证手机资源；请安装 Node.js 后重新构建。' >&2
  exit 1
fi
if [ "$#" -gt 0 ]; then
  exec node "$project_root/scripts/ios/verify-frost-skills.mjs" "$1"
fi
exec node "$project_root/scripts/ios/check.mjs" --assets-only
