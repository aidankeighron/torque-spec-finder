"use client";

import type { Fastener, SearchResult, SourceDoc } from "@/lib/types";
import { assemblyCrumbs, compactSpec } from "@/lib/render/format";
import { AnswerCard } from "./AnswerCard";

function CandidateList({
  result,
  onPick,
}: {
  result: SearchResult;
  onPick: (f: Fastener) => void;
}) {
  return (
    <div data-testid="candidate-list">
      {result.candidates.map((c, i) => (
        <button
          className="cand"
          key={c.fastener.id}
          type="button"
          data-blocked={c.blockedBy ? "true" : "false"}
          onClick={() => onPick(c.fastener)}
        >
          <span className="cand-rank">{i + 1}</span>
          <span className="cand-body">
            <span className="cand-name">{c.fastener.name}</span>
            <span className="cand-path">
              <span className={`tier tier-${c.fastener.provenance.tier}`}>
                {c.fastener.provenance.tier}
              </span>
              {assemblyCrumbs(c.fastener).join(" › ")}
            </span>
            {c.blockedBy && <span className="cand-block">Blocked: {c.blockedBy}</span>}
          </span>
          <span className="cand-spec">{compactSpec(c.fastener)}</span>
        </button>
      ))}
    </div>
  );
}

export function Results({
  result,
  sources,
  onPick,
  showDiagnostics,
  vehicleLabel,
  datasetEmpty,
}: {
  result: SearchResult | null;
  sources: SourceDoc[];
  onPick: (f: Fastener) => void;
  showDiagnostics: boolean;
  vehicleLabel: string;
  datasetEmpty: boolean;
}) {
  if (datasetEmpty) {
    return (
      <div className="card">
        <div className="flag flag-warn" style={{ marginTop: 0 }}>
          <span className="flag-icon">◆</span>
          <div>
            <strong>No specs ingested for {vehicleLabel} yet.</strong>
            <br />
            This vehicle&apos;s dataset is registered and fully segregated, but empty. It
            will stay empty rather than show values borrowed from another car or
            estimated from a generic chart.
          </div>
        </div>
      </div>
    );
  }

  if (!result) return null;

  if (result.outcome === "answer" && result.fastener) {
    return (
      <AnswerCard
        fastener={result.fastener}
        diagnostics={result.diagnostics}
        sources={sources}
        nearby={result.nearby}
        onPick={onPick}
        showDiagnostics={showDiagnostics}
      />
    );
  }

  if (result.outcome === "conflict" && result.fastener) {
    const f = result.fastener;
    const entries = Object.entries(f.conflict?.byStage ?? {});
    return (
      <div className="card" data-testid="conflict-card">
        <div className="card-head">
          <div>
            <div className="oem-name">{f.name}</div>
            <div className="crumbs">
              {assemblyCrumbs(f).map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="flag flag-danger">
          <span className="flag-icon">⚠</span>
          <div>
            <strong>Sources disagree — no single answer shown.</strong>
            <br />
            {result.reason}
          </div>
        </div>

        {entries.map(([stage, values]) => (
          <div key={stage}>
            {stage && (
              <div className="conf-label" style={{ marginTop: 14 }}>
                {stage}
              </div>
            )}
            <div className="versus">
              {values.map((v) => (
                <div key={v}>
                  <div className="spec-value">{v.split(" / ")[0]}</div>
                  <div className="spec-alt">{v.split(" / ")[1] ?? ""}</div>
                </div>
              ))}
            </div>
          </div>
        ))}

        <details className="source" open>
          <summary>Every source line for this fastener</summary>
          {f.provenance.allVerbatim.map((v, i) => (
            <div className="quote" key={`${v}-${i}`}>
              {v}
            </div>
          ))}
          <div className="locator">
            Listed in: {f.provenance.sections.join(", ")} · pages{" "}
            {f.provenance.pages.join(", ")}
          </div>
        </details>

        {result.nearby.length > 0 && (
          <div className="nearby">
            <h3>Others in {assemblyCrumbs(f).slice(-1)[0]}</h3>
            <ul>
              {result.nearby.map((n) => (
                <li key={n.id}>
                  <button type="button" onClick={() => onPick(n)}>
                    <span>{n.name}</span>
                    <span>{compactSpec(n)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  if (result.outcome === "not_found") {
    return (
      <div className="card" data-testid="not-found-card">
        <div className="flag flag-warn" style={{ marginTop: 0 }}>
          <span className="flag-icon">◆</span>
          <div>
            <strong>Not in this vehicle&apos;s data.</strong>
            <br />
            {result.reason}
          </div>
        </div>
        {result.candidates.length > 0 && (
          <>
            <div className="conf-label" style={{ marginTop: 14 }}>
              Closest names found (none met the bar)
            </div>
            <div style={{ marginTop: 8 }}>
              <CandidateList result={result} onPick={onPick} />
            </div>
          </>
        )}
        <div className="conf-note" style={{ marginTop: 12 }}>
          No value is estimated or substituted from a generic chart. If a fastener
          isn&apos;t in the source documents, this page says so.
        </div>
      </div>
    );
  }

  // abstain
  return (
    <div className="card" data-testid="abstain-card">
      <div className="flag flag-warn" style={{ marginTop: 0 }}>
        <span className="flag-icon">?</span>
        <div>
          <strong>Not sure which fastener you mean — no answer given.</strong>
          <br />
          {result.reason}
        </div>
      </div>

      {Object.keys(result.positionHints).length > 0 && (
        <div className="diag" style={{ marginTop: 12 }}>
          <span>
            read from your wording:{" "}
            {Object.entries(result.positionHints)
              .map(([k, v]) => `${k}=${v}`)
              .join("  ")}
          </span>
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        <CandidateList result={result} onPick={onPick} />
      </div>

      {showDiagnostics && (
        <div className="diag" data-testid="diagnostics">
          <span>top1 {result.diagnostics.top1.toFixed(3)}</span>
          <span>top2 {result.diagnostics.top2.toFixed(3)}</span>
          <span>margin {result.diagnostics.margin.toFixed(3)}</span>
          <span>
            need {result.diagnostics.thresholds.top1}/{result.diagnostics.thresholds.margin}
          </span>
          <span>blocked {result.diagnostics.blocked}</span>
        </div>
      )}
    </div>
  );
}
