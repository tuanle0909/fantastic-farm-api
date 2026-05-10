# Deploy Profile (Render/Railway)

This backend is intended to run as a long-lived Node service (not serverless functions).

## Build / Start commands

- Build command (needs GitHub Packages auth — see below):  
  `bash scripts/render-build.sh`  
  (Tránh gõ `echo ... ${NODE_AUTH_TOKEN}` trực tiếp trong ô Render nếu cả dòng lỡ bị bọc nháy đơn — token sẽ không expand và vẫn 401.)
- Start command: `npm run start:prod`

**GitHub Packages:** set secret **`NODE_AUTH_TOKEN`** (PAT with `read:packages`) on the host before `npm ci`. Repo includes [`render.yaml`](./render.yaml) for Render Blueprint (branch **`production`**).

## Render (quick)

1. Push branch **`production`** to GitHub (`fantastic-farm-api`).
2. Render Dashboard → **New** → **Blueprint** → connect repo → pick branch **`production`** → apply `render.yaml`.
3. In the web service **Environment**, fill every `sync: false` secret from [`.env.example`](./.env.example) (Mongo, JWT, Sui, on-chain IDs, etc.). **Never** commit `.env`.
4. **Health check** path: `/api/health` (200).

## Required environment variables

- `PORT` (platform usually injects this automatically)
- `NODE_ENV=production`
- `MONGODB_URL`
- `JWT_SECRET`
- `JWT_EXPIRES_IN` (optional, default `7d`)
- `CORS_ALLOWED_ORIGINS` (comma-separated allowed web origins)
- `SUI_NETWORK`
- `SUI_RPC_URL`
- `FANTASTIC_FARM_MINT_SIGNING_PRIVATE_KEY_HEX`
- `FANTASTIC_FARM_PACKAGE_ID`
- `FANTASTIC_FARM_REGISTRY_OBJECT_ID`
- `FANTASTIC_FARM_MARKETPLACE_OBJECT_ID`
- `FANTASTIC_FARM_FC_MINT_REGISTRY_OBJECT_ID` (required for FC swap / related flows)

Optional studio swap variables:

- `STUDIO_FC_SWAP_ENABLED`
- `FANTASTIC_FARM_STUDIO_SWAP_PRIVATE_KEY_HEX`
- `STUDIO_SWAP_SIGNER_EXPECTED_ADDRESS`
- `STUDIO_FC_SWAP_INTERVAL_MS`
- `STUDIO_FC_SWAP_MIN_AMOUNT_MIST`
- `STUDIO_FC_SWAP_ALLOW_NON_MAINNET`

## Health check setup

- Path: `/api/health`
- Success code: `200`

## Shared package

Backend depends on **`@tuanle0909/fantastic-farm-shared`** via npm alias (GitHub Packages). Use committed [`.npmrc`](./.npmrc) plus **`NODE_AUTH_TOKEN`** during install (see build command above). No sibling `../shared` folder required on the server.
