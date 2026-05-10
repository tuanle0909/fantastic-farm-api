#!/usr/bin/env bash
# Render / CI: write a complete .npmrc for GitHub Packages, then install + compile.
set -euo pipefail

RAW_TOKEN="${NODE_AUTH_TOKEN:-}"
# Trim accidental whitespace/newlines from dashboard paste
TOKEN="${RAW_TOKEN//[$'\t\r\n ']}"
if [ ${#TOKEN} -lt 20 ]; then
  echo "render-build.sh: NODE_AUTH_TOKEN missing or too short after trim (len=${#RAW_TOKEN})."
  echo "Set it under this Web Service → Environment (no quotes around the token)."
  exit 1
fi

# Full overwrite avoids broken concat / duplicate keys; order matches GitHub docs.
{
  echo "@tuanle0909:registry=https://npm.pkg.github.com"
  echo "install-links=false"
  echo "//npm.pkg.github.com/:always-auth=true"
  echo "//npm.pkg.github.com/:_authToken=${TOKEN}"
} > .npmrc

echo "render-build.sh: npm will use GitHub Packages auth (token length ${#TOKEN})."

npm ci
npm run build
