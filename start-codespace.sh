#!/usr/bin/env bash
set -e
corepack enable
corepack prepare pnpm@9.15.9 --activate
pnpm install
pnpm build
nohup pnpm start > /tmp/openhiggsfield.log 2>&1 &
echo "OpenHiggsfield started on port 3000"
