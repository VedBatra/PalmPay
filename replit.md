# BioPay

A full-stack multi-tenant biometric palm-vein payment system with three roles: User, Merchant, and Admin.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/biopay run dev` — run the React frontend (port 18682)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Optional env: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` — for live payments (demo fallback works without them)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind (biopay artifact at `/`)
- API: Express 5 + Socket.io (api-server artifact at `/api`)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- Auth: HMAC-SHA256 JWT stored in localStorage
- API codegen: Orval (from OpenAPI spec → React Query hooks)
- Real-time: Socket.io (path `/api/socket.io`)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/biopay/` — React + Vite SPA (all UI)
- `artifacts/api-server/` — Express API + Socket.io server
- `lib/db/src/schema/` — Drizzle ORM schema (users, merchants, transactions, admins)
- `lib/api-client-react/src/generated/` — auto-generated React Query hooks (do not edit)
- `artifacts/api-server/src/routes/` — all API route handlers
- `artifacts/api-server/src/lib/jwt.ts` — HMAC-SHA256 JWT sign/verify
- `artifacts/api-server/src/lib/socket.ts` — Socket.io init + emitToMerchant/emitToUser helpers
- `artifacts/biopay/src/pages/` — all pages (landing, login-*, dashboard-*)
- `artifacts/biopay/src/lib/auth.ts` — token storage helpers
- `artifacts/biopay/src/lib/socket.ts` — socket.io-client setup

## Architecture decisions

- Contract-first API: OpenAPI spec → Orval codegen → React Query hooks used throughout
- JWT stored in localStorage (not cookies) to support cross-origin kiosk hardware requests
- Socket.io rooms keyed by `merchant:<id>` and `user:<id>` for targeted real-time events
- Biometric template stored as a hash string; hardware API matches hash to find the user
- Razorpay integration has a demo fallback (no keys needed for development/testing)
- Admin seeded automatically at startup (`admin@biopay.dev` / `Admin@1234`)

## Product

**User Terminal** — register/login, enroll palm vein biometric (simulated hash), top up wallet via Razorpay, view transaction history, receive real-time balance updates via Socket.io.

**Merchant POS** — register/login with auto-assigned kiosk ID, numeric keypad to enter charge amount, initiate palm scan, real-time payment status (waiting/success/failed), earnings dashboard (today/weekly/all-time), transaction history.

**Admin Console** — system-wide KPIs (users, merchants, volume, transactions, active kiosks, failed txn), paginated user/merchant/transaction tables with search, hardware fleet status (online/offline kiosks with last-seen timestamp).

**Hardware API** — `POST /api/hardware/verify-scan` accepts `biometric_hash + merchant_id + amount`, does ACID-like balance debit/credit, emits Socket.io events to both merchant and user. `POST /api/hardware/heartbeat` keeps kiosk online status alive.

## User preferences

- Dark-compatible design with electric cyan primary (`hsl(191, 100%, 50%)`)
- Space Mono for headings/labels, Inter for body
- Font mono uppercase labels throughout the UI

## Gotchas

- Run `pnpm --filter @workspace/api-spec run codegen` after changing the OpenAPI spec before editing frontend code
- Run `pnpm --filter @workspace/db run push` after changing `lib/db/src/schema/`
- The biopay frontend base path is `/` — relative API calls work automatically via the proxy
- Socket.io path is `/api/socket.io` — do not use the default `/socket.io`

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
