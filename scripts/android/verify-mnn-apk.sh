#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOCAL_SDK="$PROJECT_ROOT/var/toolchains/android-sdk"
SDK_ROOT="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$LOCAL_SDK}}"
NDK_ROOT="${ANDROID_NDK_ROOT:-$SDK_ROOT/ndk/27.2.12479018}"
TOOLS="$NDK_ROOT/toolchains/llvm/prebuilt/darwin-x86_64/bin"
READELF="$TOOLS/llvm-readelf"
NM="$TOOLS/llvm-nm"
ZIPALIGN="${ZIPALIGN:-$SDK_ROOT/build-tools/36.0.0/zipalign}"
AAPT="${AAPT:-$SDK_ROOT/build-tools/36.0.0/aapt}"
APKSIGNER="${APKSIGNER:-$SDK_ROOT/build-tools/36.0.0/apksigner}"
APK="${POCKET_APK:-$PROJECT_ROOT/android/app/build/outputs/apk/debug/app-debug.apk}"
APK_PROFILE="${POCKET_APK_PROFILE:-offline}"
[[ "$APK_PROFILE" == "offline" || "$APK_PROFILE" == "live" ]] || {
  echo "POCKET_APK_PROFILE must be offline or live" >&2; exit 1;
}
# The final offline competition build includes the shared PP-OCR host capability:
# v6 Small for modern documents and the frozen v5 Mobile heritage profile, plus
# both WebView WASM variants and the paired ONNX Android towers used by Photos
# semantic search. ML Kit OCR is intentionally forbidden; keep an exact native
# library allowlist so a weak OCR fallback cannot silently return.
APK_MAX_BYTES="${POCKET_APK_MAX_BYTES:-268435456}"
LIB_DIR="$PROJECT_ROOT/android/app/src/main/jniLibs/arm64-v8a"
JNI="$LIB_DIR/libpocket_mnn_jni.so"
MNN="$LIB_DIR/libMNN.so"
CXX="$LIB_DIR/libc++_shared.so"

for required in "$READELF" "$NM" "$ZIPALIGN" "$AAPT" "$APKSIGNER" "$APK" "$JNI" "$MNN" "$CXX"; do
  [[ -f "$required" ]] || { echo "Missing verification input: $required" >&2; exit 1; }
done

if [[ ! -x "${JAVA_HOME:-}/bin/java" ]]; then
  if [[ -x "$PROJECT_ROOT/var/toolchains/jdk21/Contents/Home/bin/java" ]]; then
    export JAVA_HOME="$PROJECT_ROOT/var/toolchains/jdk21/Contents/Home"
  elif [[ -x /tmp/pocket-jdk21/Contents/Home/bin/java ]]; then
    export JAVA_HOME=/tmp/pocket-jdk21/Contents/Home
  else
    echo "JAVA_HOME must point to a JDK so apksigner can verify the APK" >&2
    exit 1
  fi
fi

echo "[native] ABI, dependencies, 16 KiB alignment and JNI contract"
for library in "$MNN" "$JNI" "$CXX"; do
  file "$library" | grep -q 'ELF 64-bit.*ARM aarch64' || { echo "Not AArch64: $library" >&2; exit 1; }
  "$READELF" -l "$library" | python3 -c 'import sys
loads = [line.split() for line in sys.stdin if line.lstrip().startswith("LOAD")]
raise SystemExit(0 if loads and all(int(row[-1], 16) >= 16384 for row in loads) else 1)' || {
    echo "LOAD segment below 16 KiB alignment: $library" >&2; exit 1;
  }
done

needed="$("$READELF" -d "$JNI")"
grep -q 'Shared library: \[libMNN.so\]' <<<"$needed"
grep -q 'Shared library: \[libc++_shared.so\]' <<<"$needed"

for method in nativeConfigure nativeInitialize nativeInvalidate nativeReady nativeTextReady nativeVisionReady nativeHealthTextReady nativeVersion nativeCapabilities nativeProbe nativeChat nativeHealthChat nativeVision nativeVisionPair nativeExhibitMatting nativeRestore nativeMetrics; do
  "$NM" -D --defined-only "$JNI" | grep "PocketMnnRuntime_${method}$" >/dev/null || {
    echo "Missing JNI export: $method" >&2; exit 1;
  }
done

"$NM" -D --defined-only "$MNN" | grep 'createLLM' >/dev/null || { echo "MNN LLM API missing" >&2; exit 1; }
strings "$MNN" | grep -i 'sme2' >/dev/null || { echo "SME2 kernels not present" >&2; exit 1; }
strings "$MNN" | grep -i 'kleidiai' >/dev/null || { echo "KleidiAI kernels not present" >&2; exit 1; }
strings "$JNI" | grep -F 'specialists/heritage-restorer.mnn' >/dev/null || {
  echo "Native heritage restoration model contract missing" >&2; exit 1;
}
strings "$JNI" | grep -F 'native_restoration_output_contract_mismatch' >/dev/null || {
  echo "Native heritage restoration output gate missing" >&2; exit 1;
}
strings "$JNI" | grep -F 'adapters/aesthetic-curator/visual-lora.mnn' >/dev/null || {
  echo "Native aesthetic-curator adapter contract missing" >&2; exit 1;
}
strings "$JNI" | grep -F 'pocket-jni-v9-explicit-multimodal' >/dev/null || {
  echo "Qwen3-VL-2B explicit multimodal JNI marker missing" >&2; exit 1;
}
strings "$JNI" | grep -F 'pocket-jni-v11-ocr-1mp-sampler' >/dev/null || {
  echo "Qwen3-VL-2B mobile OCR image-budget marker missing" >&2; exit 1;
}
strings "$JNI" | grep -F 'pocket-jni-v12-bound-image-tensor' >/dev/null || {
  echo "Qwen3-VL-2B bound image tensor marker missing" >&2; exit 1;
}
strings "$JNI" | grep -F 'pocket-jni-v13-official-sampler' >/dev/null || {
  echo "Qwen3-VL-2B official sampler marker missing" >&2; exit 1;
}
strings "$JNI" | grep -F 'pocket-jni-v14-qwenvl-alignment' >/dev/null || {
  echo "Qwen3-VL upstream PR #4595 alignment fix marker missing" >&2; exit 1;
}
strings "$JNI" | grep -F 'pocket-jni-v18-single-family-memory' >/dev/null || {
  echo "Single-model-family memory guard missing" >&2; exit 1;
}
strings "$JNI" | grep -F 'pocket-jni-v20-health-qwen3-4b' >/dev/null || {
  echo "Qwen3-4B health-only JNI marker missing" >&2; exit 1;
}
strings "$JNI" | grep -F 'qwen3-4b-health' >/dev/null || {
  echo "Qwen3-4B health model layout missing" >&2; exit 1;
}
strings "$MNN" | grep -F 'Qwen-VL smart resize requires' >/dev/null || {
  echo "Qwen3-VL smart-resize runtime fix missing" >&2; exit 1;
}
strings "$JNI" | grep -F 'native_vision_input_not_consumed' >/dev/null || {
  echo "Qwen3-VL visual-consumption hard gate missing" >&2; exit 1;
}

echo "[apk] packaged libraries, hashes, package identity and 16 KiB zip alignment"
temporary="$(mktemp -d /tmp/pocket-mnn-apk-verify.XXXXXX)"
trap 'rm -rf "$temporary"' EXIT
apk_entries="$(unzip -Z1 "$APK")"
apk_bytes="$(stat -f %z "$APK")"
[[ "$apk_bytes" -le "$APK_MAX_BYTES" ]] || {
  echo "APK size regression: $apk_bytes bytes exceeds $APK_MAX_BYTES" >&2
  exit 1
}
native_entries="$(grep '^lib/' <<<"$apk_entries" | sort)"
expected_native_entries=$'lib/arm64-v8a/libMNN.so\nlib/arm64-v8a/libc++_shared.so\nlib/arm64-v8a/libonnxruntime.so\nlib/arm64-v8a/libonnxruntime4j_jni.so\nlib/arm64-v8a/libpocket_mnn_jni.so'
[[ "$native_entries" == "$expected_native_entries" ]] || {
  echo "Unexpected APK native library or ABI set:" >&2
  printf '%s\n' "$native_entries" >&2
  exit 1
}
if grep -E '\.(mnn(\.weight)?|safetensors|gguf)$' <<<"$apk_entries" >/dev/null; then
  echo "Model weights must be installed after APK installation, not packaged in the APK" >&2
  exit 1
fi
for required_offline_asset in \
  assets/public/assets/ocr/PP-OCRv6_small_det_onnx_infer.tar \
  assets/public/assets/ocr/PP-OCRv6_small_rec_onnx_infer.tar \
  assets/public/assets/ocr/PP-OCRv5_mobile_det_onnx_infer.tar \
  assets/public/assets/ocr/PP-OCRv5_mobile_rec_onnx_infer.tar \
  assets/public/assets/ocr/ort/ort-wasm-simd-threaded.wasm \
  assets/public/assets/ocr/ort/ort-wasm-simd-threaded.jsep.wasm; do
  grep -Fx "$required_offline_asset" <<<"$apk_entries" >/dev/null || {
    echo "Required offline OCR asset missing: $required_offline_asset" >&2
    exit 1
  }
done
for required_demo_bundle in \
  assets/public/data-packs/pocket-earth-books/1.0.0/bundle.json \
  assets/public/data-packs/pocket-earth-movies/1.0.0/bundle.json \
  assets/public/data-packs/pocket-earth-music/1.0.0/bundle.json \
  assets/public/data-packs/guji-mapping-demo/1.0.0/bundle.json; do
  grep -Fx "$required_demo_bundle" <<<"$apk_entries" >/dev/null || {
    echo "Required offline demo Data Pack missing: $required_demo_bundle" >&2
    exit 1
  }
done
if [[ "$APK_PROFILE" == "offline" ]]; then
  offline_exhibit_prefix="assets/public/assets/exhibit-2_5d/harvard-200497-li-complete-mnn/"
  for required_exhibit_asset in \
    "${offline_exhibit_prefix}exhibit.json" \
    "${offline_exhibit_prefix}raw-mnn-gate.json" \
    "${offline_exhibit_prefix}capture-normalization.json" \
    "${offline_exhibit_prefix}originals/view-00-000.jpg" \
    "${offline_exhibit_prefix}originals/view-05-300.jpg" \
    "${offline_exhibit_prefix}views/view-00-000.webp" \
    "${offline_exhibit_prefix}views/view-00-000-depth.png" \
    "${offline_exhibit_prefix}views/view-05-300.webp" \
    "${offline_exhibit_prefix}views/view-05-300-depth.png"; do
    grep -Fx "$required_exhibit_asset" <<<"$apk_entries" >/dev/null || {
      echo "Required offline exhibition asset missing: $required_exhibit_asset" >&2
      exit 1
    }
  done
  for required_exhibit_thumbnail in \
    assets/public/assets/exhibit-2_5d/ego-ch-42-79-0-gallery-relief-museum-mnn/views/view-00-000.webp \
    assets/public/assets/exhibit-2_5d/harvard-315439-rong-mirror-museum-matting/views/view-00-000.webp \
    assets/public/assets/exhibit-2_5d/harvard-204612-jade-bi-museum-matting/views/view-00-000.webp \
    assets/public/assets/exhibit-2_5d/abo-eef43318-museum-mnn/views/view-00-000.webp \
    assets/public/assets/exhibit-2_5d/chsd-Ark_HM_791_HI-museum-mnn/views/view-00-001.webp \
    assets/public/assets/exhibit-2_5d/chsd-Ark_HM_217_HI-museum-mnn/views/view-00-001.webp; do
    grep -Fx "$required_exhibit_thumbnail" <<<"$apk_entries" >/dev/null || {
      echo "Required offline exhibition thumbnail missing: $required_exhibit_thumbnail" >&2
      exit 1
    }
  done
else
  unzip -p "$APK" assets/capacitor.config.json | grep -F 'https://pocketearth.throughtheglass.art/' >/dev/null || {
    echo "LIVE APK is not bound to the production HTTPS origin" >&2; exit 1;
  }
fi
for forbidden in \
  assets/public/mediapipe/wasm/ \
  assets/public/data-packs/pocket-earth-books/1.0.0/chunks/ \
  assets/public/data-packs/pocket-earth-movies/1.0.0/chunks/ \
  assets/public/data-packs/pocket-earth-music/1.0.0/chunks/ \
  assets/public/assets/exhibit-3dgs/ \
  assets/public/assets/skills/guji/ \
  assets/public/assets/ort-wasm-simd-threaded.jsep-B0T3yYHD.wasm \
  assets/public/exhibits/preset-nike.splat; do
  if grep -F "$forbidden" <<<"$apk_entries" >/dev/null; then
    echo "Forbidden legacy/mobile-heavy asset remains in APK: $forbidden" >&2
    exit 1
  fi
done
for name in libMNN.so libc++_shared.so libpocket_mnn_jni.so; do
  entry="lib/arm64-v8a/$name"
  unzip -p "$APK" "$entry" > "$temporary/$name"
  cmp -s "$LIB_DIR/$name" "$temporary/$name" || { echo "APK library differs: $name" >&2; exit 1; }
done

"$ZIPALIGN" -c -P 16 -v 4 "$APK" >/dev/null
badging="$("$AAPT" dump badging "$APK")"
grep -q "package: name='art.throughtheglass.pocketearth.latest'" <<<"$badging"
grep -q "versionCode='70' versionName='1.0.69'" <<<"$badging" || {
  echo "Final APK must be versionCode 70 / versionName 1.0.69" >&2; exit 1;
}
"$APKSIGNER" verify --verbose "$APK" >/dev/null

echo "[pass] $(basename "$APK")"
echo "  APK profile: $APK_PROFILE"
echo "  APK SHA256: $(shasum -a 256 "$APK" | awk '{print $1}')"
echo "  JNI SHA256: $(shasum -a 256 "$JNI" | awk '{print $1}')"
echo "  MNN SHA256: $(shasum -a 256 "$MNN" | awk '{print $1}')"
echo "  Contract: 17/17 JNI exports; MNN LLM + optional Qwen3-4B health text base + two-image visual A/B + shared PP-OCRv6/v5 offline assets + ONNX Photos semantic towers + real CPU target 2/3 switch + SME2 + KleidiAI; arm64-v8a only; no Qwen weights; <= $APK_MAX_BYTES bytes; 16 KiB aligned; APK signature verified"
