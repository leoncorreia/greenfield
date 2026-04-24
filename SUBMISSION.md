# Hackathon submission — Greenfield Vendor Ops

Use this checklist against the organizer brief: **cited.md**, **agent payment rails**, **3+ sponsor tools**, **real autonomous work on the open web** (optional discovery), **3-minute demo**.

## Criteria mapping (how this repo satisfies them)

| Criterion | In this project |
|-----------|-------------------|
| **Publish to cited.md** | Every major phase appends a structured section to `cited.md` (`CITED_MD_PATH`) via `appendCited` in `apps/server/src/services/cited.ts`. Same text is readable as **`GET /reports/latest`** and in the web UI audit panel. |
| **Agent payment rails** | After vendor selection, `attemptPaymentRails` in `apps/server/src/payments.ts` hits **x402**, **CDP**, **MPP** (Stripe-style multi-party payments in the brief), and **agentic.market** when env URLs are set; otherwise safe **skipped** stubs with idempotency in Redis. |
| **3+ sponsor tools** | Count distinct integrations: **Redis** (state + transcripts + idempotency), **LLM ranking** (OpenAI / **GMI** / Bedrock / heuristic), **optional open-web discovery** (`WEB_DISCOVERY_*`), **Nexla** (normalize), **Ghost** / **TigerData** (artifact persistence), **payment rails** above. You can truthfully cite **Redis + ranking provider + discovery OR Nexla + payment rails** (pick 3+ that you enable in the demo). |
| **Autonomous agent** | Demand → sourcing → shortlist → rank → **negotiate → pay → fulfill** (simulated negotiation/carrier; real HTTP only where you configure endpoints). |

### cited.md and Senso

- **What cited.md is:** [senso.ai/cited-md](https://senso.ai/cited-md)  
- **Quick setup:** [docs.senso.ai/docs/hello-world](https://docs.senso.ai/docs/hello-world)  

This repo **writes** cited-style audit sections to disk and exposes them over HTTP. To **publish through Senso’s context layer**, follow Senso’s hello-world: point their ingestion or connector at your **deployed** `GET /reports/latest` or hosted `cited.md` artifact, per their current docs (their product evolves; use their dashboard as source of truth).

### Sponsor skills (Shipables)

- Sign up / install skills: [shipables.dev](https://shipables.dev) (GitHub).  
- Search for sponsor skills that match **Redis**, **LLM**, **payments**, or **cited** workflows and install into Cursor if you want extra agent guidance for this codebase.  
- **Publish as a skill:** If organizers want the *project* packaged as a skill, export a `SKILL.md` that describes how to run the demo and env vars (optional follow-up).

## 3-minute demo script (suggested)

1. **0:00–0:20** — One sentence: autonomous vendor ops from demand to fulfillment, grounded in sources, audit trail in **cited.md**. Show **README** sponsor table or this file.  
2. **0:20–1:30** — **Live:** `docker compose up -d redis`, `npm run dev`, open UI. Create demand → **Start run**. Point at pipeline states, **candidates** (mock or web discovery if enabled), **ranking**, **negotiation**, **payment attempts**, **fulfillment**. Open **`GET /reports/latest`** or scroll **Audit trail** — that is your **published agent output** for judges.  
3. **1:30–2:30** — **Rails:** Show `payments.ts` / env keys (`X402_ENDPOINT`, `CDP_ENDPOINT`, `MPP_ENDPOINT`, `AGENTIC_MARKET_ENDPOINT`). Explain idempotent **order:{runId}** and that real URLs turn stubs into HTTP POSTs.  
4. **2:30–3:00** — **Fulfillment:** Click **Progress** until **COMPLETED** (or **Delay** to show escalation). Close with deploy link (e.g. Render) or repo URL.

## Pre-submit checklist

- [ ] Repo is **public** (or shared per organizer rules).  
- [ ] **Commit pushed** to default branch.  
- [ ] **README** lists how to run in 2 commands (see repo root README).  
- [ ] Optional: set **one** payment endpoint to a test receiver to show non-`skipped` attempts (no secrets in repo).  
- [ ] Optional: `LLM_PROVIDER=gmi` or `openai` with keys for a flashier ranking (heuristic is fine for demo).  
- [ ] Register demo URL / video / form per **official submission portal** (not stored in this file).

## Links (brief)

| Topic | URL |
|--------|-----|
| cited.md (Senso) | https://senso.ai/cited-md |
| Senso hello world | https://docs.senso.ai/docs/hello-world |
| Sponsor skills | https://shipables.dev |
