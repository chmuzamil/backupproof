#!/usr/bin/env bash
set -euo pipefail
npm run build
mkdir -p dist-package
cp -r dist package.json README.md dist-package/
echo "Linux package ready in dist-package/"
