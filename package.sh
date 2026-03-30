#!/bin/bash

set -e

EXTENSION_NAME="chatclaw-extension"
VERSION=$(node -p "require('./manifest.json').version")
BUILD_DIR="dist"
OUTPUT_DIR="release"

echo "======================================"
echo "ChatClaw Chrome Extension Packager"
echo "======================================"
echo ""

echo "[1/3] Building extension..."
npm run build

if [ ! -d "$BUILD_DIR" ]; then
    echo "Error: Build directory $BUILD_DIR not found!"
    exit 1
fi

echo ""
echo "[2/3] Creating release directory..."
mkdir -p "$OUTPUT_DIR"

echo ""
echo "[3/3] Packaging extension..."
cd "$BUILD_DIR"

ZIP_NAME="${EXTENSION_NAME}-v${VERSION}.zip"
zip -r "../${OUTPUT_DIR}/${ZIP_NAME}" . -x "*.DS_Store" -x "*.map"

cd ..

echo ""
echo "======================================"
echo "✓ Build completed successfully!"
echo "======================================"
echo ""
echo "Output: ${OUTPUT_DIR}/${ZIP_NAME}"
echo "Size: $(du -h "${OUTPUT_DIR}/${ZIP_NAME}" | cut -f1)"
echo ""
