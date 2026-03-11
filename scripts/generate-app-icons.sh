#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/src-tauri/icons"

INPUT_ICON="${1:-}"

if [[ -z "$INPUT_ICON" ]]; then
  for candidate in \
    "$ROOT_DIR/public/icon.png" \
    "$ROOT_DIR/public/icon-512x512.png" \
    "$ROOT_DIR/public/icon.svg"
  do
    if [[ -f "$candidate" ]]; then
      INPUT_ICON="$candidate"
      break
    fi
  done
fi

if [[ -z "$INPUT_ICON" ]]; then
  echo "Error: no input icon found."
  echo "Provide one explicitly: ./scripts/generate-app-icons.sh <path-to-icon.png|.svg>"
  echo "Or add one of: public/icon.png, public/icon-512x512.png, public/icon.svg"
  exit 1
fi

echo "Generating Tauri icons from: $INPUT_ICON"
echo "Output directory: $OUTPUT_DIR"

cd "$ROOT_DIR"
npm run tauri icon -- "$INPUT_ICON" -o "$OUTPUT_DIR"

echo "Done. Updated icons for Windows (.ico), macOS (.icns), and PNG sizes."
