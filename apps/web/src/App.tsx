import { useCallback, useEffect, useState } from "react";

const API_ORIGIN = (import.meta.env.VITE_API_ORIGIN as string | undefined)?.replace(/\/$/, "") ?? "";

function api(path: string, init?: RequestInit) {
  const url = API_ORIGIN ? `${API_ORIGIN}${path}` : `/api${path}`;
  return fetch(url, init);
}

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
  const [sku, setSku] = useState("WIDGET-100");
  const [units, setUnits] = useState("100");
  const [maxPrice, setMaxPrice] = useState("12.5");
  const [deliveryBy, setDeliveryBy] = useState("2026-05-01");

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
      .then((j) => setHealth(JSON.stringify(j)))
      .catch(() => setHealth("unreachable"));
    void refreshCited();
  }, [refreshCited]);

  useEffect(() => {
    if (!run?.id) return;
    const t = setInterval(() => void refreshRun(run.id), 1500);
    return () => clearInterval(t);
  }, [run?.id, refreshRun]);

  async function createDemand() {
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
      const j = (await r.json()) as { run: Run };
      setRun(j.run);
      await refreshCited();
    } finally {
      setBusy(false);
    }
  }

  async function startRun() {
    if (!run) return;
    setBusy(true);
    try {
      await api(`/runs/${run.id}/start`, { method: "POST" });
      await refreshRun(run.id);
      await refreshCited();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>Vendor Ops — pipeline</h1>
      <p>
        <span className="sim">SIMULATION</span> Mock vendors and discovery path are not real marketplaces or unsolicited
        outreach.
        {API_ORIGIN ? (
          <>
            {" "}
            API: <code>{API_ORIGIN}</code>
          </>
        ) : null}
      </p>
      <div className="card">
        <strong>Health</strong>
        <pre>{health}</pre>
      </div>
      <div className="card">
        <h2>Create demand</h2>
        <label>SKU</label>
        <input value={sku} onChange={(e) => setSku(e.target.value)} />
        <label>Units</label>
        <input value={units} onChange={(e) => setUnits(e.target.value)} />
        <label>Max $ / unit</label>
        <input value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
        <label>Delivery by</label>
        <input value={deliveryBy} onChange={(e) => setDeliveryBy(e.target.value)} />
        <button type="button" disabled={busy} onClick={() => void createDemand()}>
          POST /demand
        </button>
      </div>
      {run && (
        <div className="card">
          <h2>Run {run.id}</h2>
          <p>
            State: <strong>{run.state}</strong> · Correlation: <code>{run.correlationId}</code>
          </p>
          <button type="button" disabled={busy || run.state !== "DEMAND_RECEIVED"} onClick={() => void startRun()}>
            POST /runs/:id/start
          </button>
          <h3>Candidates</h3>
          <ul>
            {run.artifacts.candidates.map((c) => (
              <li key={c.sourceUrl}>
                {c.vendorName} — ${c.pricePerUnit}/u, MOQ {c.moq}, {c.leadTimeDays}d ·{" "}
                <a href={c.sourceUrl} target="_blank" rel="noreferrer">
                  source
                </a>{" "}
                {c.simulation !== false ? <span className="sim">SIMULATION</span> : null}
              </li>
            ))}
          </ul>
          {run.artifacts.lastSourcingNote && <pre>{run.artifacts.lastSourcingNote}</pre>}
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
        <h2>cited.md (via GET /reports/latest)</h2>
        <pre>{cited || "…"}</pre>
      </div>
    </main>
  );
}
