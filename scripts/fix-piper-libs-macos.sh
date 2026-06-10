#!/usr/bin/env bash
# Repara Piper en macOS: copia dylibs de piper-phonemize y espeak-ng-data.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN_DIR="$ROOT/src-tauri/bin"
LIB_DIR="$BIN_DIR/lib"
PHONEMIZE_VERSION="2023.11.14-4"
ARCH="$(uname -m)"

case "$ARCH" in
  arm64) PHONEMIZE_ARCHIVE="piper-phonemize_macos_aarch64.tar.gz" ;;
  x86_64) PHONEMIZE_ARCHIVE="piper-phonemize_macos_x64.tar.gz" ;;
  *) echo "Arquitectura no soportada: $ARCH" >&2; exit 1 ;;
esac

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Descargando librerías Piper..."
curl -fsL \
  "https://github.com/rhasspy/piper-phonemize/releases/download/${PHONEMIZE_VERSION}/${PHONEMIZE_ARCHIVE}" \
  -o "$TMP/phonemize.tar.gz"
tar -xzf "$TMP/phonemize.tar.gz" -C "$TMP"

mkdir -p "$LIB_DIR"
cp -L "$TMP/piper-phonemize/lib"/lib*.dylib "$LIB_DIR/"

if [[ ! -d "$BIN_DIR/espeak-ng-data" ]]; then
  echo "Descargando espeak-ng-data..."
  curl -fsL \
    "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_macos_aarch64.tar.gz" \
    -o "$TMP/piper.tar.gz"
  tar -xzf "$TMP/piper.tar.gz" -C "$TMP"
  cp -R "$TMP/piper/espeak-ng-data" "$BIN_DIR/espeak-ng-data"
fi

for binary in "$BIN_DIR/piper" "$BIN_DIR"/piper-*-apple-darwin; do
  if [[ -f "$binary" ]]; then
    install_name_tool -add_rpath @executable_path/lib "$binary" 2>/dev/null || true
  fi
done

export DYLD_LIBRARY_PATH="$LIB_DIR"
echo "Hola" | "$BIN_DIR/piper" \
  --model "$ROOT/src-tauri/models/piper/es_ES-sharvard-medium.onnx" \
  --output_file /tmp/simple-narrator-test-es.wav

echo "OK: librerías instaladas y Piper funciona (/tmp/simple-narrator-test-es.wav)"
