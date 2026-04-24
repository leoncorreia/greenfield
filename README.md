# Greenfield — Autonomous Vendor Ops Agent

**Hackathon submission checklist:** see [`SUBMISSION.md`](./SUBMISSION.md) (criteria mapping, 3-minute demo script, Senso / Shipables links).

Hackathon-grade monorepo demonstrating a **closed economic loop**: demand → sourcing → shortlist → **negotiate → pay → fulfill** (all **simulated** after ranking: in-process negotiation, env-driven payment stubs, carrier phases advanced via `POST /demo/advance-shipment`), plus **optional** open-web discovery behind `WEB_DISCOVERY_ENABLED`.

## Sponsor story (tool mapping)

| Capability | Tool / layer |
|------------|----------------|
| Candidate store, negotiation transcript, order state, idempotency | **Redis** (ioredis) |
| Discovery extraction | **Mock vendor JSON** by default; optional fetch + extract pipeline with robots.txt + rate limits when `WEB_DISCOVERY_ENABLED=true` |
| Vendor ranking (Milestone 4) | **OpenAI** (`openai`), **GMI Cloud** (`gmi`), **Bedrock** (`bedrock`), or **`none`** (heuristic) |
| Optional normalization | **Nexla** — passthrough + logs if keys absent |
| Optional persistence of research artifacts | **Ghost** / **TigerData** — skipped if unset |
| Payment attempts | **x402**, **CDP**, **MPP**, **agentic.market** — env-driven HTTP stubs in `payments.ts` |
| Audit trail | **`cited.md`** (append per major phase) + `GET /reports/latest` |

## State machine (exact)

`DEMAND_RECEIVED` → `SOURCING` → `SHORTLISTED` → `NEGOTIATING` → `SELECTED` → `PAYMENT_SUBMITTED` → `FULFILLMENT_TRACKING` → `COMPLETED` \| `ESCALATED`

After `SHORTLISTED`, the server runs **vendor ranking** (`rankVendorOffers` in `apps/server/src/llm/ranking.ts`), then automatically continues **negotiation** (`simulateNegotiation` in `apps/server/src/services/negotiation.ts`, transcript in Redis), **selection**, **payment stubs** (`attemptPaymentRails` in `apps/server/src/payments.ts`), and **fulfillment tracking** (`apps/server/src/services/fulfillment.ts`). Each step appends to `cited.md`. Use **`POST /demo/advance-shipment`** with `{ "runId", "kind": "progress" | "delay" }` to simulate carrier movement or delays until `COMPLETED` or `ESCALATED`.

### Production today vs roadmap

| Phase | Status in this repo |
|-------|----------------------|
| Demand → Redis, run lifecycle | **Shipped** |
| Mock vendor sourcing + optional **open web** discovery (`WEB_DISCOVERY_*`) | **Shipped** (“Tinyfish-style” = this pipeline, not a separate product) |
| Nexla / Ghost / TigerData hooks | **Wired** (no-op or stub logs when env empty) |
| LLM ranking (OpenAI / **GMI** / Bedrock / heuristic) | **Shipped** |
| `cited.md` + `GET /reports/latest` | **Shipped** |
| Payment module (`payments.ts`) + `POST /payments/simulate` (dev only) | **Stubs**; **also** invoked from orchestrator after selection (`order:{runId}`) |
| Negotiation (SIMULATION), selection, pay → fulfill, delay escalation | **Shipped** — orchestrator through `FULFILLMENT_TRACKING`; UI + `POST /demo/advance-shipment` for carrier simulation |

In production you get the full **demand → sourcing → shortlist → rank → negotiate → pay → fulfill (simulated)** path in one **Start run** action, then you drive delivery with **`POST /demo/advance-shipment`** (or the buttons in the demo UI when the run is in fulfillment).

## Prerequisites

- Node.js **20**
- **Local development:** Redis reachable at `REDIS_URL` (see [`.env.example`](./.env.example)). Easiest: `docker compose up -d redis`. You can also point `REDIS_URL` at any Redis-compatible host you already use.
- **Production (Render):** Redis is created by the Blueprint as **Render Key Value**; `REDIS_URL` is wired automatically. You do not need to provision Redis manually.

## Quick start (local)

```bash
cp .env.example .env
docker compose up -d redis
npm install
npm run dev
```

- **UI + API:** [http://127.0.0.1:5173](http://127.0.0.1:5173) (Vite proxies `/api` → server on port **8080**).
- **API only:** `npm run dev:server` then `GET http://127.0.0.1:8080/health`.

**One process / one URL (optional):** build the web app, then point the server at the dist folder:

```bash
npm run build -w apps/web
# in .env for the server:
STATIC_WEB_ROOT=apps/web/dist
npm run dev:server
```

Open [http://127.0.0.1:8080](http://127.0.0.1:8080) — the same server serves the SPA and the REST API.

Health: `GET http://127.0.0.1:8080/health`

Create demand and start a run:

```bash
curl -s -X POST http://127.0.0.1:8080/demand ^
  -H "Content-Type: application/json" ^
  -d "{\"sku\":\"WIDGET-100\",\"units\":100,\"maxPricePerUnit\":12.5,\"deliveryBy\":\"2026-05-01\"}"

curl -s -X POST http://127.0.0.1:8080/runs/<RUN_ID>/start
curl -s http://127.0.0.1:8080/runs/<RUN_ID>
curl -s http://127.0.0.1:8080/reports/latest
```

Mock vendor quotes (same server):

- `GET {PUBLIC_BASE_URL}/mock/vendor-a?sku=WIDGET-100`
- `GET {PUBLIC_BASE_URL}/mock/vendor-b?sku=WIDGET-100`

## LLM ranking (Milestone 4)

| `LLM_PROVIDER` | Behavior |
|----------------|----------|
| `none` | Heuristic rank (price, MOQ vs units, lead time, cap violations) — no network |
| `openai` | `POST …/chat/completions` with `response_format: json_object`; requires `OPENAI_API_KEY`. Optional `OPENAI_BASE_URL` (default `https://api.openai.com/v1`) |
| `gmi` | **[GMI Cloud](https://docs.gmicloud.ai/inference-engine/api-reference/llm-api-reference)** Inference Engine — OpenAI-compatible `POST /v1/chat/completions`. Set **`GMI_API_KEY`** and **`GMI_MODEL`** (e.g. a model id from GMI’s catalog). Optional **`GMI_BASE_URL`** (default `https://api.gmi-serving.com/v1`). You may reuse **`OPENAI_API_KEY`** / **`OPENAI_BASE_URL`** / **`OPENAI_MODEL`** instead if you prefer one shared `.env` layout. |
| `bedrock` | AWS **Converse** API via `@aws-sdk/client-bedrock-runtime`; requires `AWS_REGION`, `AWS_BEDROCK_MODEL_ID`, and credentials (e.g. `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` or instance role) |

Invalid LLM JSON or HTTP errors **fall back** to the heuristic rank and log the error.

## Environment variables

See [`.env.example`](./.env.example). Highlights:

| Variable | Purpose |
|----------|---------|
| `REDIS_URL` | Redis connection (Render: set automatically from Key Value via Blueprint) |
| `PUBLIC_BASE_URL` | Base URL for discovery to call `/mock/vendor-*`. On Render, if unset, the server falls back to **`RENDER_EXTERNAL_URL`** (injected by Render) |
| `CITED_MD_PATH` | Where audit markdown is appended |
| `WEB_DISCOVERY_*` | Bounded public discovery when enabled |
| `LLM_PROVIDER`, `OPENAI_*`, `GMI_*`, `AWS_*` | Ranking (Milestone 4) |
| `VITE_API_ORIGIN` | Web production build: origin of the API (no trailing slash), e.g. `https://greenfield-vendor-api.onrender.com` |
| `X402_ENDPOINT`, `CDP_ENDPOINT`, … | Payment stub POST targets when set |

## Monorepo layout

- `apps/server` — TypeScript **strict**, HTTP API, Redis, orchestrator, discovery, LLM ranking, cited writer
- `apps/web` — Vite + React pipeline viewer; dev uses `/api` proxy; production uses `VITE_API_ORIGIN`

## Cloud deploy — Render (recommended)

Repository includes [`render.yaml`](./render.yaml) (Blueprint). It provisions:

- **`greenfield-keyvalue`** — Render **Key Value** (Redis®-compatible), internal connection string only (`ipAllowList: []`).
- **`greenfield-vendor-api`** — Node web service with **`REDIS_URL`** wired via `fromService` → `connectionString` (no manual Redis setup).

Deploy steps:

1. Push this repository to GitHub.
2. In the [Render Dashboard](https://dashboard.render.com/), choose **New** → **Blueprint**, connect the repo, and select `render.yaml`.
3. **`PUBLIC_BASE_URL`** is optional: on Render the server defaults to **`RENDER_EXTERNAL_URL`** when `PUBLIC_BASE_URL` is unset, so mock discovery can call the same host without extra configuration.
4. **`render.yaml`** declares **integration environment variables** (discovery, LLM, Nexla, Ghost, TigerData, payment endpoints) so they appear on the service — set values in **Environment** (empty strings are stripped at startup). For **Bedrock** on Render, prefer an **IAM instance role** or set `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` manually in the dashboard (not in git).

**Build / start** (from repo root, per `render.yaml`): the Blueprint runs **`NPM_CONFIG_PRODUCTION=false NODE_ENV=development npm ci`** so **devDependencies (e.g. Vite) are installed** even though the service sets `NODE_ENV=production` for runtime; then it builds **server + web**. **`STATIC_WEB_ROOT=apps/web/dist`** serves the demo UI from the same URL as the API. Health checks use `GET /health`.

### Optional integrations on Render

These keys are listed in [`render.yaml`](./render.yaml) so they show up on the Web Service → **Environment** tab. Empty values are ignored at startup (see `loadConfig` in `apps/server/src/config.ts`).

| Area | Role | Environment variables |
|------|------|-------------------------|
| **Open web discovery** (“Tinyfish-style” pipeline in code: fetch, robots.txt, rate limits — **not** a separate Tinyfish env) | Optional public sourcing | `WEB_DISCOVERY_ENABLED=true`, `WEB_DISCOVERY_SEED_URLS` (comma-separated URLs), `WEB_DISCOVERY_MAX_PAGES`, `WEB_DISCOVERY_RATE_MS` |
| **LLM ranking** | OpenAI, GMI Cloud, or Bedrock | `LLM_PROVIDER` (`openai` \| `gmi` \| `bedrock`), `OPENAI_*`, **`GMI_API_KEY`**, **`GMI_MODEL`**, optional `GMI_BASE_URL`, `AWS_REGION`, `AWS_BEDROCK_MODEL_ID` (+ AWS credentials in dashboard for Bedrock) |
| **Nexla** | Optional payload normalization | `NEXLA_API_KEY`, `NEXLA_BASE_URL` |
| **Ghost** | Optional research artifacts | `GHOST_ADMIN_API_KEY`, `GHOST_CONTENT_API_URL` |
| **TigerData** | Optional SQL persistence | `TIGERDATA_DATABASE_URL` |
| **Payment rails** | Stub HTTP POSTs when URL set | `X402_ENDPOINT`, `CDP_ENDPOINT`, `MPP_ENDPOINT`, `AGENTIC_MARKET_ENDPOINT` |

With **`LLM_PROVIDER=none`** (the Blueprint default), you do **not** need API keys for ranking; the server uses the built-in heuristic. Set **`LLM_PROVIDER=gmi`** (or `openai` / `bedrock`) and fill the matching keys to use a live model in production.

**Note:** Key Value uses the **starter** plan in the Blueprint (Render Key Value does not use the web “free” tier). The API web service remains on the **free** plan unless you change it in `render.yaml`.

**Static UI on Render (optional):** Create a second **Static Site** with root `apps/web`, build `npm ci && npm run build -w apps/web`, publish directory `apps/web/dist`. Add an environment variable **`VITE_API_ORIGIN`** (in the static service’s **Environment** tab) set to your API’s origin so the browser calls the API directly (CORS is enabled on the server).

## Cloud deploy — Fly.io

1. Install [Fly CLI](https://fly.io/docs/hands-on/install-flyctl/).
2. From `apps/server`, create an app: `fly launch` (add Redis via [Upstash](https://upstash.com/) or Fly Redis).
3. Set secrets: `fly secrets set REDIS_URL=redis://... PUBLIC_BASE_URL=https://<your-app>.fly.dev`
4. Deploy: `fly deploy`

## Demo script (~3 minutes) — full product

1. Start Redis + `npm run dev`, then open **http://127.0.0.1:5173** (or use `STATIC_WEB_ROOT` + **http://127.0.0.1:8080**).
2. In the web UI: create a demand (N units, SKU, budget, date).
3. Start run — watch **Sourcing** → **Shortlisted**; expand **Ranking** (heuristic or LLM per env).
4. Open **cited.md** via **GET /reports/latest** — sourcing + ranking sections with URLs / excerpts.
5. *(Later)* Negotiation transcript, selection, payment stub logs.
6. *(Later)* `POST /demo/advance-shipment` twice; observe escalation if delays &gt; 3.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Server + web concurrently |
| `npm run dev:server` | API only |
| `npm test` | Unit tests (state machine, payments, ranking schema / heuristic) |

## License

MIT — hackathon / educational use.
