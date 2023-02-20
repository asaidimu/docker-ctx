#!/usr/bin/env sh
set -eu

yarn build:dist
cd dist
yarn pack . alcides
tar -zxvf alcides-v1.0.0.tgz
[ -e "../node_modules/docker-ctx" ] && rm -rf ../node_modules/docker-ctx
mv package ../node_modules/docker-ctx
cd ..
rm -rf dist
chmod +x node_modules/docker-ctx/index.js

