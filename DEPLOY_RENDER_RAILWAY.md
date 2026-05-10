# Deploy Profile (Render/Railway)

This backend is intended to run as a long-lived Node service (not serverless functions).

## Build / Start commands

- Build command: `npm install && npm run build`
- Start command: `npm run start:prod`

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

## Important note about shared package (temporary model)

Because backend uses `file:../shared`, deployment must include both folders and build `shared` first.

Suggested sequence in CI/workspace init:

1. `cd ../shared && npm install && npm run build`
2. `cd ../backend-repo && npm install && npm run build && npm run start:prod`
