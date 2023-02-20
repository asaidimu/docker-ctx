#!/usr/bin/env sh
set -eu

rm -rf dist
yarn tsc --no-sourceMap
cp README.md LICENSE.md dist/
cp dist.package.json dist/package.json
