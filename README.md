# Greenfield — Autonomous Vendor Ops Agent

Hackathon-grade monorepo demonstrating a **closed economic loop**: demand → sourcing → shortlist → (later) negotiate → pay → fulfill, with **simulated** negotiation/fulfillment where real outreach would be unsafe, and **optional** open-web discovery behind `WEB_DISCOVERY_ENABLED`.

## Sponsor story (tool mapping)

| Capability | Tool / layer |
|------------|----------------|
| Candidate store, negotiation transcript, order state, idempotency | **Redis** (ioredis) |
| Discovery extraction | **Mock vendor JSON** by default; optional fetch + extract pipeline with robots.txt + rate limits when `WEB_DISCOVERY_ENABLED=true` |
| Vendor ranking (Milestone 4) | **OpenAI-compatible** JSON (`LLM_PROVIDER=openai`) or **AWS Bedrock** Converse (`LLM_PROVIDER=bedrock`); **`none`** = deterministic heuristic |
| Optional normalization | **Nexla** — passthrough + logs if keys absent |
| Optional persistence of research artifacts | **Ghost** / **TigerData** — skipped if unset |
| Payment attempts | **x402**, **CDP**, **MPP**, **agentic.market** — env-driven HTTP stubs in `payments.ts` |
| Audit trail | **`cited.md`** (append per major phase) + `GET /reports/latest` |

## State machine (exact)

`DEMAND_RECEIVED` → `SOURCING` → `SHORTLISTED` → `NEGOTIATING` → `SELECTED` → `PAYMENT_SUBMITTED` → `FULFILLMENT_TRACKING` → `COMPLETED` \| `ESCALATED`

**Milestone 4 (done):** After `SHORTLISTED`, the server runs **vendor ranking** (`rankVendorOffers` in `apps/server/src/llm/ranking.ts`): structured JSON validated with **Zod** (`vendorRankingOutputSchema`), persisted on `run.artifacts.ranking`, and a **Ranking** section appended to `cited.md` (`buildRankingCited`). Negotiation / payments / fulfillment remain future milestones.

## Prerequisites

- Node.js **20**
- **Local development:** Redis reachable at `REDIS_URL` (see [`.env.example`](./.env.example)). Easiest: `docker compose up -d redis`. You can also point `REDIS_URL` at any Redis-compatible host you already use.
- **Production (Render):** Redis is created by the Blueprint as **Render Key Value**; `REDIS_URL` is wired automatically. You do not need to provision Redis manually.

## Quick start (local)

```bash
cp .env.example .env
docker compose up -d redis
npm install
npm run dev:server
```

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
| `openai` | `POST …/chat/completions` with `response_format: json_object`; requires `OPENAI_API_KEY`. Optional `OPENAI_BASE_URL` for GMI / Azure OpenAI-style gateways |
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
| `LLM_PROVIDER`, `OPENAI_*`, `AWS_*` | Ranking (Milestone 4) |
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
4. **Other integrations** are not part of the Blueprint file on purpose (so you are not prompted for dozens of keys). Add them in the Web Service → **Environment** when you need them — see [Optional integrations on Render](#optional-integrations-on-render) below.

**Build / start** (from repo root, per `render.yaml`): `npm ci && npm run build -w apps/server` then `npm run start -w apps/server`. Health checks use `GET /health`.

### Optional integrations on Render

The Blueprint screen only reflects what is **in `render.yaml`** (Key Value + API defaults). The product still supports the full sponsor-style surface from [`.env.example`](./.env.example); configure these manually on the web service when you turn a feature on:

| Area | Role | Environment variables |
|------|------|-------------------------|
| **Open web discovery** (“Tinyfish-style” pipeline in code: fetch, robots.txt, rate limits — not a separate vendor SDK) | Optional public sourcing | `WEB_DISCOVERY_ENABLED=true`, `WEB_DISCOVERY_SEED_URLS`, `WEB_DISCOVERY_MAX_PAGES`, `WEB_DISCOVERY_RATE_MS` |
| **LLM ranking** | OpenAI-compatible or Bedrock | `LLM_PROVIDER` (`openai` \| `bedrock`), `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`, `AWS_REGION`, `AWS_BEDROCK_MODEL_ID`, plus AWS credentials for Bedrock |
| **Nexla** | Optional payload normalization | `NEXLA_API_KEY`, `NEXLA_BASE_URL` |
| **Ghost** | Optional research artifacts | `GHOST_ADMIN_API_KEY`, `GHOST_CONTENT_API_URL` |
| **TigerData** | Optional SQL persistence | `TIGERDATA_DATABASE_URL` |
| **Payment rails** | Stub HTTP POSTs | `X402_ENDPOINT`, `CDP_ENDPOINT`, `MPP_ENDPOINT`, `AGENTIC_MARKET_ENDPOINT` |

With **`LLM_PROVIDER=none`** (the Blueprint default), you do **not** need OpenAI or Bedrock keys for ranking; the server uses the built-in heuristic.

**Note:** Key Value uses the **starter** plan in the Blueprint (Render Key Value does not use the web “free” tier). The API web service remains on the **free** plan unless you change it in `render.yaml`.

**Static UI on Render (optional):** Create a second **Static Site** with root `apps/web`, build `npm ci && npm run build -w apps/web`, publish directory `apps/web/dist`. Add an environment variable **`VITE_API_ORIGIN`** (in the static service’s **Environment** tab) set to your API’s origin so the browser calls the API directly (CORS is enabled on the server).

## Cloud deploy — Fly.io

1. Install [Fly CLI](https://fly.io/docs/hands-on/install-flyctl/).
2. From `apps/server`, create an app: `fly launch` (add Redis via [Upstash](https://upstash.com/) or Fly Redis).
3. Set secrets: `fly secrets set REDIS_URL=redis://... PUBLIC_BASE_URL=https://<your-app>.fly.dev`
4. Deploy: `fly deploy`

## Demo script (~3 minutes) — full product

1. Start Redis + `npm run dev` (server + web).
2. Open the web UI; create a demand (N units, SKU, budget, date).
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
