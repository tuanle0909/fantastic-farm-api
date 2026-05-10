# Backend Split Guide

This folder is ready to be moved into a standalone backend repository for independent deployment.

## 1) Files to keep in the new backend repo

- `src/`
- `scripts/`
- `package.json`
- `tsconfig.json`
- `.gitignore`
- `.env.example`
- `README_SPLIT_BACKEND.md`
- `DEPLOY_RENDER_RAILWAY.md`

Do not copy `node_modules/`, `.env`, logs, or local editor artifacts.

## 2) Shared package (GitHub Packages)

Backend resolves `@fantastic-farm/shared` via **npm alias** to `@tuanle0909/fantastic-farm-shared` published on GitHub Packages.

Committed [`.npmrc`](./.npmrc) sets `@tuanle0909:registry=https://npm.pkg.github.com`.

**Local / CI install:** create a GitHub PAT with `read:packages`, then before `npm ci`:

```bash
echo "//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}" >> .npmrc
```

Or log in once: `npm login --scope=@tuanle0909 --registry=https://npm.pkg.github.com`.

**Monorepo dev:** if `../shared` exists with matching package name, npm may **link** the local folder — same imports. See [`../shared/PUBLISH_GITHUB.md`](../shared/PUBLISH_GITHUB.md) to publish new versions.

The script `npm run check:shared` accepts either `node_modules/@fantastic-farm/shared/dist/index.js` or `../shared/dist/index.js`.

## 3) Local run (split clone)

1. `npm install` (with GitHub Packages auth as above)
2. `npm run build`
3. `npm run start:prod`

## 4) Health check

- Endpoint: `GET /api/health`
- Expected response: `{ "status": "ok" }`
