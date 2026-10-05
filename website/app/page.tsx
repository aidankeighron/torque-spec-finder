"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_VEHICLE_ID, VEHICLES, getIndex, getVehicle } from "@/lib/registry";
import { byAssembly, search } from "@/lib/search/engine";
import type { Fastener, SearchResult } from "@/lib/types";
import { compactSpec } from "@/lib/render/format";
import { Results } from "@/components/Results";
import { loadEmbedder, type Embedder } from "@/lib/search/embeddings";

const EXAMPLES: Record<string, string[]> = {
  "c5-2003-base": [
    "rear sway bar bottom bolt",
    "lug nuts",
    "head bolts",
    "front lower ball joint",
    "rear shock bottom bolt",
    "brake caliper bracket",
    "diff pinion nut",
    "harmonic balancer",
  ],
  "c3-1979-base-auto": ["lug nuts", "head bolts", "trailing arm", "pinion nut"],
};

type Tab = "search" | "browse" | "coverage";

export default function Page() {
  const [vehicleId, setVehicleId] = useState(DEFAULT_VEHICLE_ID);
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [tab, setTab] = useState<Tab>("search");
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [semantic, setSemantic] = useState(false);
  const [embedder, setEmbedder] = useState<Embedder | null>(null);
  const [embedState, setEmbedState] = useState<"off" | "loading" | "ready" | "error">("off");

  const vehicle = getVehicle(vehicleId);
  const dataset = vehicle.dataset;
  const index = useMemo(() => getIndex(vehicleId), [vehicleId]);
  const datasetEmpty = dataset.fasteners.length === 0;

  // Optional semantic layer. Self-hosted model files, lazily loaded, and the
  // app is fully functional without it — per the architecture a weaker or
  // absent model costs abstains, never correctness.
  useEffect(() => {
    if (!semantic || embedder || embedState === "loading") return;
    setEmbedState("loading");
    loadEmbedder()
      .then((e) => {
        setEmbedder(e);
        setEmbedState("ready");
      })
      .catch(() => setEmbedState("error"));
  }, [semantic, embedder, embedState]);

  const [result, setResult] = useState<SearchResult | null>(null);

  const runSearch = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setResult(null);
        return;
      }
      let queryEmbedding: Float32Array | null = null;
      if (semantic && embedder && index.embeddings) {
        try {
          queryEmbedding = await embedder.embed(q);
        } catch {
          queryEmbedding = null;
        }
      }
      setResult(search(index, q, { queryEmbedding }));
    },
    [index, semantic, embedder],
  );

  useEffect(() => {
    void runSearch(submitted);
  }, [submitted, runSearch]);

  // Changing vehicle must never show the previous car's result.
  useEffect(() => {
    setResult(null);
    setSubmitted("");
    setQuery("");
  }, [vehicleId]);

  const pickFastener = (f: Fastener) => {
    // Deliberately does NOT set `submitted`. Doing so re-triggered the search
    // effect, which replaced the record the user had just explicitly chosen
    // with whatever a fresh search for its name returned — often an abstain.
    // The user has already resolved the ambiguity; re-running the gate undoes
    // their decision.
    setQuery(f.name);
    setTab("search");
    // Jump straight to the chosen record rather than re-running the gate,
    // because the user has just resolved the ambiguity themselves.
    setResult({
      outcome: "answer",
      query: f.name,
      vehicleId,
      fastener: f,
      candidates: [],
      reason: "",
      positionHints: {},
      nearby: dataset.fasteners.filter((o) => o.assembly === f.assembly && o.id !== f.id).slice(0, 8),
      diagnostics: {
        top1: 1, top2: 0, margin: 1, gatePassed: true, blocked: 0,
        totalScanned: dataset.fasteners.length, usedEmbeddings: false,
        thresholds: { top1: 0, margin: 0 },
      },
    });
  };

  const groups = useMemo(() => [...byAssembly(dataset).entries()].sort(), [dataset]);
  const examples = EXAMPLES[vehicleId] ?? [];

  return (
    <>
      <header className="topbar">
        <div className="wrap topbar-inner">
          <div className="brand">
            <span className="brand-mark">◎</span>
            <span>Torque Spec Finder</span>
            <span className="brand-sub">refuses to guess</span>
          </div>

          <div className="vehicle-bar">
            <span className="vehicle-label">Vehicle</span>
            <select
              className="vehicle-select"
              aria-label="Vehicle"
              data-testid="vehicle-select"
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
            >
              {VEHICLES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                  {v.dataset.fasteners.length === 0 ? " — no data yet" : ""}
                </option>
              ))}
            </select>
            <div className="vehicle-facts">
              <span className="fact">{dataset.vehicle.engine}</span>
              <span className="fact">{dataset.vehicle.platform}</span>
              <span className="fact" data-testid="fastener-count">
                {dataset.fasteners.length} fasteners
              </span>
            </div>
            <div className="seg-note">
              Datasets are fully segregated — a search only ever reads the selected
              vehicle&apos;s data.
            </div>
          </div>
        </div>
      </header>

      <main className="wrap">
        <div className="tabs" role="tablist">
          {(["search", "browse", "coverage"] as Tab[]).map((t) => (
            <button
              key={t}
              className="tab"
              role="tab"
              aria-selected={tab === t}
              data-testid={`tab-${t}`}
              onClick={() => setTab(t)}
            >
              {t === "search" ? "Search" : t === "browse" ? "Browse" : "Coverage & sources"}
            </button>
          ))}
        </div>

        {tab === "search" && (
          <>
            <form
              className="searchbar"
              onSubmit={(e) => {
                e.preventDefault();
                setSubmitted(query);
              }}
            >
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. rear sway bar bottom bolt"
                aria-label="Search for a fastener"
                data-testid="search-input"
              />
              <button type="submit" data-testid="search-submit" disabled={datasetEmpty}>
                Look up
              </button>
            </form>

            {examples.length > 0 && (
              <div className="examples">
                <span className="examples-label">Try:</span>
                {examples.map((ex) => (
                  <button
                    className="chip"
                    key={ex}
                    type="button"
                    onClick={() => {
                      setQuery(ex);
                      setSubmitted(ex);
                    }}
                  >
                    {ex}
                  </button>
                ))}
              </div>
            )}

            <div className="toolbar">
              <label>
                <input
                  type="checkbox"
                  checked={semantic}
                  onChange={(e) => setSemantic(e.target.checked)}
                  data-testid="semantic-toggle"
                />
                Semantic boost
                {embedState === "loading" && " (loading model…)"}
                {embedState === "ready" && " (ready)"}
                {embedState === "error" && " (unavailable — lexical search unaffected)"}
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={showDiagnostics}
                  onChange={(e) => setShowDiagnostics(e.target.checked)}
                  data-testid="diagnostics-toggle"
                />
                Show scoring diagnostics
              </label>
            </div>

            <Results
              result={result}
              sources={dataset.sources}
              onPick={pickFastener}
              showDiagnostics={showDiagnostics}
              vehicleLabel={dataset.vehicle.label}
              datasetEmpty={datasetEmpty}
            />

            {!result && !datasetEmpty && (
              <div className="empty">
                Ask for a fastener in plain language. Say where it is — &ldquo;rear&rdquo;,
                &ldquo;lower&rdquo;, &ldquo;driver side&rdquo; — and those words become hard
                constraints, not hints.
              </div>
            )}
          </>
        )}

        {tab === "browse" && (
          <div className="browse" data-testid="browse">
            {groups.length === 0 && <div className="empty">No data for this vehicle yet.</div>}
            {groups.map(([assembly, list]) => (
              <details className="browse-group" key={assembly}>
                <summary>
                  {assembly}
                  <span>{list.length}</span>
                </summary>
                <div className="browse-list">
                  {list.map((f) => (
                    <button key={f.id} type="button" onClick={() => pickFastener(f)}>
                      <span>{f.name}</span>
                      <span>{compactSpec(f)}</span>
                    </button>
                  ))}
                </div>
              </details>
            ))}
          </div>
        )}

        {tab === "coverage" && (
          <div data-testid="coverage">
            <div className="stat-grid">
              {[
                ["fasteners", "Fasteners"],
                ["assemblies", "Assemblies"],
                ["tierA", "Tier A (verified)"],
                ["tierB", "Tier B (extracted)"],
                ["multiStage", "Multi-stage"],
                ["superseded", "Superseded by TSB"],
                ["corroborated", "Independently corroborated"],
                ["conflicts", "Conflicts"],
                ["sourceDefects", "Source defects found"],
              ].map(([key, label]) => (
                <div className="stat" key={key}>
                  <div className="stat-n">{dataset.stats[key] ?? 0}</div>
                  <div className="stat-k">{label}</div>
                </div>
              ))}
            </div>

            <div className="card">
              <div className="conf-label">Sources</div>
              {dataset.sources.length === 0 && (
                <div className="conf-note" style={{ marginTop: 8 }}>
                  None yet.
                </div>
              )}
              {dataset.sources.map((s) => (
                <div className="locator" key={s.id} style={{ marginTop: 10 }}>
                  <span className={`tier tier-${s.tier}`}>{s.tier}</span>{" "}
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noreferrer noopener">
                      {s.title}
                    </a>
                  ) : (
                    <strong>{s.title}</strong>
                  )}
                  {s.revision && <> · rev {s.revision}</>}
                  {s.note && <div className="conf-note">{s.note}</div>}
                </div>
              ))}
            </div>

            {(dataset as { notIngested?: Array<{ item: string; reason: string; url?: string }> })
              .notIngested?.length ? (
              <div className="card">
                <div className="conf-label">
                  Deliberately NOT ingested — found but not trustworthy enough
                </div>
                <div className="conf-note" style={{ marginTop: 6 }}>
                  These values exist online. They are excluded rather than shown with a
                  caveat, because a torque spec you half-trust is worse than one you know
                  you don&apos;t have.
                </div>
                {(
                  dataset as unknown as {
                    notIngested: Array<{ item: string; reason: string; url?: string }>;
                  }
                ).notIngested.map((n) => (
                  <div className="locator" key={n.item} style={{ marginTop: 10 }}>
                    <strong>{n.item}</strong>
                    <div className="conf-note">{n.reason}</div>
                    {n.url && (
                      <a href={n.url} target="_blank" rel="noreferrer noopener">
                        source
                      </a>
                    )}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )}

        <footer className="foot">
          Torque values are rendered directly from typed fields in the baked dataset —
          never generated, converted, or rounded by this app. The only derived number in
          the pipeline is the N·m / lb-ft cross-check used at ingest to detect source
          defects, and it never reaches the screen as a spec.
          <br />
          Static site: no backend, no database, no external services. Verify every value
          against your own manual before turning a wrench.
        </footer>
      </main>
    </>
  );
}
