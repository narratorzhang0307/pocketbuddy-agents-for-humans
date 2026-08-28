#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this installer as root on the target server." >&2
  exit 1
fi

BASE=/opt/pocketbuddy/qwen3-4b
LLAMA_COMMIT=9d77fa17254e1dee4b9e92504c91611a60b1359f
LLAMA_BUILD=10488
LLAMA_SOURCE_SHA256=8813df36be97588b527550151182526469eb551588d42a92dbc86a9cd039e2e5
MODEL_SHA256=7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5
MODEL_NAME=Qwen3-4B-Q4_K_M.gguf
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

for command in cmake curl g++ sha256sum systemctl tar; do
  command -v "${command}" >/dev/null || {
    echo "Missing required command: ${command}" >&2
    exit 1
  }
done

download_verified() {
  local url=$1
  local destination=$2
  local expected_sha=$3

  if [[ -f ${destination} ]] && printf '%s  %s\n' "${expected_sha}" "${destination}" | sha256sum -c - >/dev/null 2>&1; then
    return
  fi

  curl -fL --retry 6 --retry-delay 5 --continue-at - -o "${destination}.part" "${url}"
  printf '%s  %s\n' "${expected_sha}" "${destination}.part" | sha256sum -c -
  mv "${destination}.part" "${destination}"
}

install -d -m 0755 \
  "${BASE}/build/b${LLAMA_BUILD}" \
  "${BASE}/downloads" \
  "${BASE}/model" \
  "${BASE}/runtime" \
  "${BASE}/source"

SOURCE_ARCHIVE="${BASE}/downloads/llama.cpp-${LLAMA_COMMIT}.tar.gz"
SOURCE_DIR="${BASE}/source/llama.cpp-${LLAMA_COMMIT}"
download_verified \
  "https://github.com/ggml-org/llama.cpp/archive/${LLAMA_COMMIT}.tar.gz" \
  "${SOURCE_ARCHIVE}" \
  "${LLAMA_SOURCE_SHA256}"

if [[ ! -f ${SOURCE_DIR}/CMakeLists.txt ]]; then
  tar -xzf "${SOURCE_ARCHIVE}" -C "${BASE}/source"
fi

cmake -S "${SOURCE_DIR}" -B "${BASE}/build/b${LLAMA_BUILD}" \
  -DCMAKE_BUILD_TYPE=Release \
  -DBUILD_SHARED_LIBS=OFF \
  -DGGML_NATIVE=ON \
  -DGGML_OPENMP=ON \
  -DGGML_CCACHE=OFF \
  -DLLAMA_CURL=OFF \
  -DLLAMA_BUILD_UI=OFF \
  -DLLAMA_BUILD_TESTS=OFF \
  -DLLAMA_BUILD_EXAMPLES=OFF \
  -DLLAMA_BUILD_APP=OFF \
  -DLLAMA_BUILD_COMMIT="${LLAMA_COMMIT}" \
  -DLLAMA_BUILD_NUMBER="${LLAMA_BUILD}"
cmake --build "${BASE}/build/b${LLAMA_BUILD}" --target llama-server -j2
ln -sfn "${BASE}/build/b${LLAMA_BUILD}/bin" "${BASE}/runtime/current"

download_verified \
  "https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/main/${MODEL_NAME}?download=true" \
  "${BASE}/model/${MODEL_NAME}" \
  "${MODEL_SHA256}"
chmod 0644 "${BASE}/model/${MODEL_NAME}"

install -m 0644 "${SCRIPT_DIR}/pocketbuddy-qwen3-4b.service" /etc/systemd/system/pocketbuddy-qwen3-4b.service
systemctl daemon-reload
systemctl enable --now pocketbuddy-qwen3-4b.service
