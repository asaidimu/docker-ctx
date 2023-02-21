#!/usr/bin/env sh
set -eu

rm -rf dist
yarn tsc --sourceMap false
cp README.md LICENSE.md dist/
cp dist.package.json dist/package.json
