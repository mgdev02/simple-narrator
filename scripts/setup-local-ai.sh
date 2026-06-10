#!/usr/bin/env bash
# Instala Piper (TTS) + modelos ES/EN y Argos Translate (traducción offline en↔es).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TAURI_DIR="$ROOT/src-tauri"
BIN_DIR="$TAURI_DIR/bin"
LIB_DIR="$BIN_DIR/lib"
MODELS_DIR="$TAURI_DIR/models/piper"
VENV_DIR="$TAURI_DIR/.venv-translate"
PIPER_VERSION="2023.11.14-2"
PIPER_BASE="https://github.com/rhasspy/piper/releases/download/${PIPER_VERSION}"
PHONEMIZE_VERSION="2023.11.14-4"
PHONEMIZE_BASE="https://github.com/rhasspy/piper-phonemize/releases/download/${PHONEMIZE_VERSION}"
HF_BASE="https://huggingface.co/rhasspy/piper-voices/resolve/main"

mkdir -p "$BIN_DIR" "$LIB_DIR" "$MODELS_DIR"

echo "==> Detectando plataforma..."
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin)
    case "$ARCH" in
      arm64)
        PIPER_ARCHIVE="piper_macos_aarch64.tar.gz"
        PHONEMIZE_ARCHIVE="piper-phonemize_macos_aarch64.tar.gz"
        PIPER_SIDEcar="piper-aarch64-apple-darwin"
        ;;
      x86_64)
        PIPER_ARCHIVE="piper_macos_x64.tar.gz"
        PHONEMIZE_ARCHIVE="piper-phonemize_macos_x64.tar.gz"
        PIPER_SIDEcar="piper-x86_64-apple-darwin"
        ;;
      *)
        echo "Arquitectura macOS no soportada: $ARCH" >&2
        exit 1
        ;;
    esac
    ;;
  Linux)
    PHONEMIZE_ARCHIVE="piper-phonemize_linux_${ARCH}.tar.gz"
    case "$ARCH" in
      aarch64|arm64)
        PIPER_ARCHIVE="piper_linux_aarch64.tar.gz"
        PIPER_SIDEcar="piper-aarch64-unknown-linux-gnu"
        ;;
      x86_64)
        PIPER_ARCHIVE="piper_linux_x86_64.tar.gz"
        PIPER_SIDEcar="piper-x86_64-unknown-linux-gnu"
        ;;
      *)
        echo "Arquitectura Linux no soportada: $ARCH" >&2
        exit 1
        ;;
    esac
    ;;
  *)
    echo "Sistema no soportado por este script: $OS" >&2
    echo "En Windows descarga piper_windows_amd64.zip manualmente." >&2
    exit 1
    ;;
esac

download() {
  local url="$1"
  local dest="$2"
  echo "   Descargando $(basename "$dest")..."
  curl -fL --progress-bar "$url" -o "$dest"
}

fix_macos_piper_binary() {
  local binary="$1"
  if [[ "$OS" != Darwin ]]; then
    return
  fi
  if ! command -v install_name_tool >/dev/null 2>&1; then
    echo "   install_name_tool no encontrado; omitiendo rpath." >&2
    return
  fi
  install_name_tool -add_rpath @executable_path/lib "$binary" 2>/dev/null || true
  install_name_tool -add_rpath @executable_path/lib "$binary" 2>/dev/null || true
}

echo "==> Piper TTS"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

download "${PIPER_BASE}/${PIPER_ARCHIVE}" "$TMP_DIR/piper.tar.gz"
tar -xzf "$TMP_DIR/piper.tar.gz" -C "$TMP_DIR"

PIPER_ROOT="$TMP_DIR/piper"
PIPER_BIN="$PIPER_ROOT/piper"
if [[ ! -f "$PIPER_BIN" ]]; then
  echo "No se encontró piper dentro del archivo." >&2
  exit 1
fi

cp "$PIPER_BIN" "$BIN_DIR/piper"
cp "$PIPER_BIN" "$BIN_DIR/$PIPER_SIDEcar"
chmod +x "$BIN_DIR/piper" "$BIN_DIR/$PIPER_SIDEcar"

if [[ -d "$PIPER_ROOT/espeak-ng-data" ]]; then
  rm -rf "$BIN_DIR/espeak-ng-data"
  cp -R "$PIPER_ROOT/espeak-ng-data" "$BIN_DIR/espeak-ng-data"
  echo "   Datos espeak-ng: $BIN_DIR/espeak-ng-data"
fi

echo "==> Librerías Piper (espeak-ng, onnxruntime, phonemize)"
download "${PHONEMIZE_BASE}/${PHONEMIZE_ARCHIVE}" "$TMP_DIR/phonemize.tar.gz"
tar -xzf "$TMP_DIR/phonemize.tar.gz" -C "$TMP_DIR"

PHONEMIZE_LIB="$TMP_DIR/piper-phonemize/lib"
if [[ ! -d "$PHONEMIZE_LIB" ]]; then
  echo "No se encontró piper-phonemize/lib en el tarball." >&2
  exit 1
fi

rm -f "$LIB_DIR"/*.dylib "$LIB_DIR"/*.so* 2>/dev/null || true
cp -L "$PHONEMIZE_LIB"/lib*.dylib "$LIB_DIR/" 2>/dev/null || true
cp -L "$PHONEMIZE_LIB"/lib*.so* "$LIB_DIR/" 2>/dev/null || true

PHONEMIZE_BIN="$TMP_DIR/piper-phonemize/bin/piper_phonemize"
if [[ -f "$PHONEMIZE_BIN" ]]; then
  cp "$PHONEMIZE_BIN" "$BIN_DIR/piper_phonemize"
  chmod +x "$BIN_DIR/piper_phonemize"
  echo "   piper_phonemize: $BIN_DIR/piper_phonemize"
fi

fix_macos_piper_binary "$BIN_DIR/piper"
fix_macos_piper_binary "$BIN_DIR/$PIPER_SIDEcar"

PIPER_ARCH="$(file "$BIN_DIR/piper" | awk -F': ' '{print $2}')"
echo "   Instalado: $BIN_DIR/piper ($PIPER_ARCH)"
if [[ "$OS" == Darwin && "$ARCH" == arm64 && "$PIPER_ARCH" == *x86_64* ]]; then
  echo "   Nota Apple Silicon: Piper oficial es x86_64. Instala Rosetta si falla:"
  echo "   softwareupdate --install-rosetta --agree-to-license"
fi

download_model() {
  local rel_path="$1"
  local stem="$2"
  rm -f "$MODELS_DIR/${stem}.onnx.patched"
  download "${HF_BASE}/${rel_path}/${stem}.onnx" "$MODELS_DIR/${stem}.onnx"
  download "${HF_BASE}/${rel_path}/${stem}.onnx.json" "$MODELS_DIR/${stem}.onnx.json"
}

echo "==> Modelos de voz Piper"
download_model "es/es_ES/sharvard/medium" "es_ES-sharvard-medium"
download_model "en/en_US/lessac/medium" "en_US-lessac-medium"

echo "==> Piper 1 (piper-tts) + alineación fonema ONNX"
PIPER_VENV="$TAURI_DIR/.venv-piper"
python3 -m venv "$PIPER_VENV"
"$PIPER_VENV/bin/pip" install --upgrade pip piper-tts onnx onnxruntime
"$PIPER_VENV/bin/python" "$ROOT/scripts/patch_piper_models.py" "$MODELS_DIR"

echo "==> Argos Translate (traducción offline en↔es)"
if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 no encontrado. Instala Python 3.9+ y vuelve a ejecutar este script." >&2
  exit 1
fi

python3 -m venv "$VENV_DIR"
"$VENV_DIR/bin/pip" install --upgrade pip argostranslate
"$VENV_DIR/bin/argospm" update
"$VENV_DIR/bin/argospm" install translate-en_es
"$VENV_DIR/bin/argospm" install translate-es_en

echo ""
echo "==> Verificación Piper"
export DYLD_LIBRARY_PATH="$LIB_DIR:${DYLD_LIBRARY_PATH:-}"
echo "Hola" | "$BIN_DIR/piper" \
  --model "$MODELS_DIR/es_ES-sharvard-medium.onnx" \
  --output_file /tmp/simple-narrator-test-es.wav
echo "   OK: /tmp/simple-narrator-test-es.wav"

echo ""
echo "Instalación completa. Ejecuta: npm run tauri dev"
