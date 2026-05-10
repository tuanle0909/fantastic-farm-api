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

## 2) Current dependency model (temporary)

Backend currently uses:

```json
"@fantastic-farm/shared": "file:../shared"
```

So your deployment workspace must include sibling folders:

- `backend-repo/` (this BE code)
- `shared/` (the shared package source)

## 3) Local run in split mode

From sibling root:

1. Build shared:
   - `cd shared`
   - `npm install`
   - `npm run build`
2. Build + run backend:
   - `cd ../backend-repo`
   - `npm install`
   - `npm run build`
   - `npm run start:prod`

The script `npm run check:shared` fails fast if `../shared/dist/index.js` is missing.

## 4) Health check

- Endpoint: `GET /api/health`
- Expected response: `{ "status": "ok" }`
