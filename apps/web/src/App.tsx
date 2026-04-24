import { useCallback, useEffect, useMemo, useState } from "react";

const API_ORIGIN = (import.meta.env.VITE_API_ORIGIN as string | undefined)?.replace(/\/$/, "") ?? "";

/** Vite dev: proxy `/api` → API. Production on same host as API: call paths at repo root. */
function apiUrl(path: string): string {
  if (API_ORIGIN) return `${API_ORIGIN}${path}`;
  if (import.meta.env.DEV) return `/api${path}`;
  return path;
}

function api(path: string, init?: RequestInit) {
  return fetch(apiUrl(path), init);
}

const PIPELINE_STEPS = [
  "DEMAND_RECEIVED",
  "SOURCING",
  "SHORTLISTED",
  "NEGOTIATING",
  "SELECTED",
  "PAYMENT_SUBMITTED",
  "FULFILLMENT_TRACKING",
  "COMPLETED",
] as const;

type Run = {
  id: string;
  correlationId: string;
  state: string;
  demandId: string;
  artifacts: {
    candidates: Array<{
      vendorName: string;
      pricePerUnit: number;
      moq: number;
      leadTimeDays: number;
      sourceUrl: string;
      simulation?: boolean;
    }>;
    lastSourcingNote?: string;
    ranking?: {
      provider: string;
      rankedVendorIds: string[];
      rationale: string;
      anomalies?: string[];
      citedHighlights: Array<{ vendorId: string; excerpt: string; sourceUrl: string }>;
    };
  };
};

export function App() {
  const [health, setHealth] = useState<string>("…");
  const [run, setRun] = useState<Run | null>(null);
  const [cited, setCited] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sku, setSku] = useState("WIDGET-100");
  const [units, setUnits] = useState("100");
  const [maxPrice, setMaxPrice] = useState("12.5");
  const [deliveryBy, setDeliveryBy] = useState("2026-05-01");

  const modeLabel = useMemo(() => {
    if (API_ORIGIN) return `Remote API (${API_ORIGIN})`;
    if (import.meta.env.DEV) return "Local dev (Vite → /api → server)";
    return "Same origin (UI served by API)";
  }, []);

  const refreshRun = useCallback(async (id: string) => {
    const r = await api(`/runs/${id}`);
    if (r.ok) setRun((await r.json()) as Run);
  }, []);

  const refreshCited = useCallback(async () => {
    const r = await api("/reports/latest");
    if (r.ok) {
      const j = (await r.json()) as { markdown: string };
      setCited(j.markdown);
    }
  }, []);

  useEffect(() => {
    void api("/health")
      .then((r) => r.json())
      .then((j) => setHealth(JSON.stringify(j, null, 2)))
      .catch(() => setHealth("unreachable — start the API and Redis"));
    void refreshCited();
  }, [refreshCited]);

  useEffect(() => {
    if (!run?.id) return;
    const t = setInterval(() => void refreshRun(run.id), 1500);
    return () => clearInterval(t);
  }, [run?.id, refreshRun]);

  const stepIndex =
    run != null
      ? PIPELINE_STEPS.indexOf(run.state as (typeof PIPELINE_STEPS)[number])
      : -1;
  const escalated = run?.state === "ESCALATED";
  const completed = run?.state === "COMPLETED";

  async function createDemand() {
    setError(null);
    setBusy(true);
    try {
      const r = await api("/demand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku,
          units: Number(units),
          maxPricePerUnit: Number(maxPrice),
          deliveryBy,
        }),
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(t || r.statusText);
      }
      const j = (await r.json()) as { run: Run };
      setRun(j.run);
      await refreshCited();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function startRun() {
    if (!run) return;
    setError(null);
    setBusy(true);
    try {
      const r = await api(`/runs/${run.id}/start`, { method: "POST" });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string; state?: string };
        throw new Error(j.error ?? r.statusText);
      }
      await refreshRun(run.id);
      await refreshCited();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <header className="hero">
        <h1>Vendor Ops — demo UI</h1>
        <p className="hero-sub">
          <span className="sim">SIMULATION</span> In-repo mock vendors; negotiation and payments are not live. Open web
          discovery is optional and bounded by config.
        </p>
        <p className="kbd-line">
          <strong>How to demo (local):</strong> <kbd>docker compose up -d redis</kbd> → <kbd>cp .env.example .env</kbd> →{" "}
          <kbd>npm install</kbd> → <kbd>npm run dev</kbd> → open <kbd>http://127.0.0.1:5173</kbd> (UI + API proxy).
        </p>
        <p className="muted">
          Mode: {modeLabel}. API paths: <code>{import.meta.env.DEV ? "/api/*" : "/*"}</code>
        </p>
      </header>

      {error && (
        <div className="card err" role="alert">
          <strong>Error</strong>
          <pre>{error}</pre>
        </div>
      )}

      <div className="card">
        <strong>Health</strong>
        <pre>{health}</pre>
      </div>

      <div className="card">
        <h2>1 · Create demand</h2>
        <label>SKU</label>
        <input value={sku} onChange={(e) => setSku(e.target.value)} />
        <label>Units</label>
        <input value={units} onChange={(e) => setUnits(e.target.value)} />
        <label>Max $ / unit</label>
        <input value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
        <label>Delivery by</label>
        <input value={deliveryBy} onChange={(e) => setDeliveryBy(e.target.value)} />
        <button type="button" disabled={busy} onClick={() => void createDemand()}>
          Create demand
        </button>
      </div>

      {run && (
        <div className="card">
          <h2>2 · Run pipeline</h2>
          <p>
            Run <code>{run.id}</code> · correlation <code>{run.correlationId}</code>
          </p>

          <div className="pipeline" aria-label="Run state">
            {PIPELINE_STEPS.map((step, i) => {
              const done = !escalated && (stepIndex > i || (completed && i === stepIndex));
              const current = !escalated && !completed && stepIndex === i;
              const cls = ["step", done ? "done" : "", current ? "current" : escalated ? "dim" : ""]
                .filter(Boolean)
                .join(" ");
              return (
                <div key={step} className={cls} title={step}>
                  <span className="step-idx">{done && !current ? "✓" : i + 1}</span>
                  <span className="step-name">{step.replace(/_/g, " ")}</span>
                </div>
              );
            })}
            {escalated && (
              <div className="step final escalated">
                <span className="step-name">ESCALATED</span>
              </div>
            )}
          </div>

          {run.state === "SOURCING" && (
            <p className="pulse">
              <strong>Sourcing…</strong> polling every 1.5s (async worker).
            </p>
          )}

          <button type="button" disabled={busy || run.state !== "DEMAND_RECEIVED"} onClick={() => void startRun()}>
            Start run (sourcing + ranking)
          </button>

          <h3>Candidates</h3>
          {run.artifacts.candidates.length === 0 && run.state !== "DEMAND_RECEIVED" ? (
            <p className="muted">No candidates yet…</p>
          ) : (
            <ul className="cand-list">
              {run.artifacts.candidates.map((c) => (
                <li key={c.sourceUrl}>
                  <strong>{c.vendorName}</strong> — ${c.pricePerUnit}/u, MOQ {c.moq}, {c.leadTimeDays}d ·{" "}
                  <a href={c.sourceUrl} target="_blank" rel="noreferrer">
                    source
                  </a>{" "}
                  {c.simulation !== false ? <span className="sim">SIMULATION</span> : null}
                </li>
              ))}
            </ul>
          )}
          {run.artifacts.lastSourcingNote && <pre className="note">{run.artifacts.lastSourcingNote}</pre>}

          {run.artifacts.ranking && (
            <>
              <h3>Ranking ({run.artifacts.ranking.provider})</h3>
              <p>
                <strong>Order:</strong> {run.artifacts.ranking.rankedVendorIds.join(" → ")}
              </p>
              <pre>{run.artifacts.ranking.rationale}</pre>
              {run.artifacts.ranking.anomalies && run.artifacts.ranking.anomalies.length > 0 && (
                <pre>Anomalies:{"\n"}{run.artifacts.ranking.anomalies.join("\n")}</pre>
              )}
            </>
          )}
        </div>
      )}

      <div className="card">
        <h2>3 · Audit trail</h2>
        <p className="muted">From <code>GET /reports/latest</code> (same content as cited.md on the server).</p>
        <pre className="cited-block">{cited || "…"}</pre>
      </div>
    </main>
  );
}
