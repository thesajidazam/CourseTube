#!/usr/bin/env bash
# Builds store-ready zips for Chrome and Firefox into ./dist
set -euo pipefail
cd "$(dirname "$0")"
rm -rf dist && mkdir -p dist/chrome dist/firefox
for t in chrome firefox; do
  cp extension/content.js extension/content.css dist/$t/ && cp -r extension/icons dist/$t/icons
done
cp extension/manifest.json dist/chrome/manifest.json
cp extension/manifest.firefox.json dist/firefox/manifest.json
(cd dist/chrome  && zip -qDX ../coursetube-chrome.zip  manifest.json content.js content.css icons/*.png)
(cd dist/firefox && zip -qDX ../coursetube-firefox.zip manifest.json content.js content.css icons/*.png)
echo "Built dist/coursetube-chrome.zip and dist/coursetube-firefox.zip"
