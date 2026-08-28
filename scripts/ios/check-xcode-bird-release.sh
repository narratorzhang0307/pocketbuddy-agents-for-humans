#!/bin/sh
# Read-only post-resource gate. No signing, device access or network requests.
set -eu
PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
export PATH
exec "${NODE_BINARY:-node}" "$SRCROOT/../../scripts/hardware/check-bird-release.mjs" \
  --app "$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH"
