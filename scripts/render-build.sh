#!/usr/bin/env bash
# Render / CI: append GitHub Packages auth then install + compile.
# Do not wrap the dashboard build command in single quotes or ${NODE_AUTH_TOKEN} will not expand.
set -euo pipefail

if [ -z "${NODE_AUTH_TOKEN:-}" ]; then
  echo "render-build.sh: NODE_AUTH_TOKEN is empty — add it under Service → Environment on Render."
  exit 1
fi

printf '%s\n' "//npm.pkg.github.com/:_authToken:${NODE_AUTH_TOKEN}" >> .npmrc

npm ci
npm run build
