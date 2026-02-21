# fisher

Basic EVVM fisher HTTP server using Bun.

## Install

```bash
bun install
```

## Environment

Required:

- `EVVM_SEPOLIA_RPC_URL`
- `FISHER_PRIVATE_KEY`

Optional:

- `EVVM_SEPOLIA_CHAIN_ID` (default: 11155111)
- `FISHER_PORT` (default: 8787)

## Run

```bash
bun run index.ts
```

## Execute endpoint

```bash
curl -X POST http://localhost:8787/execute \
  -H "content-type: application/json" \
  -d '{"signedAction": { /* SignedAction payload */ }}'
```

The server accepts a `SignedAction` object or a serialized SignedAction string in the request body.
