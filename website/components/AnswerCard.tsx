"use client";

import type { Fastener, SearchResult, SourceDoc } from "@/lib/types";
import {
  assemblyCrumbs,
  compactSpec,
  confidence,
  headline,
  positionSummary,
  renderedTextForGuard,
  stageLine,
  stageName,
} from "@/lib/render/format";
import { checkNoInventedNumbers } from "@/lib/render/guard";

interface Props {
  fastener: Fastener;
  diagnostics: SearchResult["diagnostics"];
  sources: SourceDoc[];
  nearby: Fastener[];
  onPick: (f: Fastener) => void;
  showDiagnostics: boolean;
}

export function AnswerCard({
  fastener,
  diagnostics,
  sources,
  nearby,
  onPick,
  showDiagnostics,
}: Props) {
  const h = headline(fastener);
  const conf = confidence(fastener, diagnostics);
  const pos = positionSummary(fastener);
  const multi = fastener.stages.length > 1;

  // The output guard. Every numeral about to be displayed must exist in the
  // record. If this ever fails we show nothing rather than a possibly-wrong
  // torque value. See lib/render/guard.ts for why this is deliberately
  // redundant with the architecture.
  const guard = checkNoInventedNumbers(renderedTextForGuard(fastener), fastener);
  if (!guard.ok) {
    return (
      <div className="card">
        <div className="flag flag-danger" style={{ marginTop: 0 }}>
          <span className="flag-icon">■</span>
          <div>
            <strong>Blocked by the output guard.</strong>
            <br />
            Rendering this record would have shown {guard.offending.length} number(s) that
            are not present in its source data ({guard.offending.join(", ")}). Showing
            nothing is the correct outcome — a possibly-wrong torque value must never
            reach the screen. This is a bug; the record id is{" "}
            <code>{fastener.id}</code>.
          </div>
        </div>
      </div>
    );
  }

  const sourceById = (id: string) => sources.find((s) => s.id === id);

  return (
    <div className="card" data-testid="answer-card">
      <div className="card-head">
        <div>
          <div className="oem-name" data-testid="fastener-name">
            {fastener.name}
          </div>
          <div className="crumbs">
            {assemblyCrumbs(fastener).map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          {pos.length > 0 && (
            <div className="pos-tags">
              {pos.map((p) => (
                <span className="pos-tag" key={p}>
                  {p}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="spec-value" data-testid="spec-primary">
        {h.primary}
      </div>
      {h.secondary && <div className="spec-alt">{h.secondary}</div>}

      {multi && (
        <div className="stages" data-testid="stages">
          {fastener.stages.map((s) => (
            <div className="stage" key={`${s.no}-${s.primary}`}>
              <span className="stage-no">{stageName(s)}</span>
              <span className="stage-val">{stageLine(s)}</span>
              {s.detail && <span className="stage-detail">{s.detail}</span>}
            </div>
          ))}
        </div>
      )}

      {fastener.supersedes && (
        <div className="flag flag-info" data-testid="supersession">
          <span className="flag-icon">⟳</span>
          <div>
            <strong>Revised by a GM service bulletin.</strong> The value above comes from{" "}
            {sourceById(fastener.supersedes.bulletin)?.title ?? fastener.supersedes.bulletin}
            , which replaced the manual&apos;s <s>{fastener.supersedes.oldValue}</s>.
            {fastener.supersedes.note && <> {fastener.supersedes.note}</>}
          </div>
        </div>
      )}

      {fastener.warnings.map((w) => (
        <div
          className={`flag ${w.kind === "single_use" ? "flag-danger" : "flag-warn"}`}
          key={w.kind}
          data-testid={`warning-${w.kind}`}
        >
          <span className="flag-icon">{w.kind === "single_use" ? "⚠" : "◆"}</span>
          <div>
            <strong>
              {w.kind === "single_use" ? "Single use — do not reuse. " : "Before tightening: "}
            </strong>
            {w.text}
          </div>
        </div>
      ))}

      {fastener.sourceDefects.length > 0 && (
        <div className="flag flag-warn" data-testid="source-defect">
          <span className="flag-icon">!</span>
          <div>
            <strong>The source document is internally inconsistent here.</strong> The
            printed values are shown above exactly as published. Detected at ingest:
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {fastener.sourceDefects.map((d) => (
                <li key={d.stage}>{d.detail}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {fastener.sequenceNote && (
        <div className="reqs">
          <div className="req">
            <div className="req-k">Sequence</div>
            <div className="req-v">{fastener.sequenceNote}</div>
          </div>
        </div>
      )}

      <div className="confidence">
        <div className="conf">
          <div className="conf-label">Match confidence — is this your fastener?</div>
          <div className="conf-value" data-testid="match-confidence">
            {conf.matchLabel}
          </div>
          <div className="conf-note">{conf.matchNote}</div>
        </div>
        <div className="conf">
          <div className="conf-label">Source confidence — where the number came from</div>
          <div className="conf-value">
            <span className={`tier tier-${conf.tier}`}>{conf.tier}</span>
            {conf.tierLabel}
          </div>
          <div className="conf-note">{conf.corroborationNote}</div>
        </div>
      </div>

      <details className="source" data-testid="source-details">
        <summary>Show the original source text and provenance</summary>
        <div className="quote">{fastener.provenance.verbatim}</div>
        <div className="locator">
          {fastener.provenance.sourceIds.map((id) => {
            const s = sourceById(id);
            if (!s) return <div key={id}>{id}</div>;
            return (
              <div key={id}>
                <span className={`tier tier-${s.tier}`}>{s.tier}</span>{" "}
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noreferrer noopener">
                    {s.title}
                  </a>
                ) : (
                  s.title
                )}
                {s.revision && <> · rev {s.revision}</>}
              </div>
            );
          })}
          <div>
            Listed in: {fastener.provenance.sections.join(", ")} · page
            {fastener.provenance.pages.length > 1 ? "s" : ""}{" "}
            {fastener.provenance.pages.join(", ")}
          </div>
          <div className="conf-note">{conf.tierNote}</div>
        </div>

        {(fastener.corroboration ?? []).length > 0 && (
          <>
            <div className="conf-label" style={{ marginTop: 14 }}>
              Independent sources
            </div>
            <div className="locator">
              {(fastener.corroboration ?? []).map((c, i) => {
                const s = sourceById(c.sourceId);
                return (
                  <div key={`${c.sourceId}-${i}`}>
                    {c.agrees ? "✓ agrees" : "✗ disagrees"} — {c.value} ·{" "}
                    {s?.url ? (
                      <a href={s.url} target="_blank" rel="noreferrer noopener">
                        {s.title}
                      </a>
                    ) : (
                      (s?.title ?? c.sourceId)
                    )}
                    {c.note && <> — {c.note}</>}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {fastener.supersedes && (
          <>
            <div className="conf-label" style={{ marginTop: 14 }}>
              Superseded value (do not use)
            </div>
            <div className="quote">
              {fastener.supersedes.oldStages
                ?.map((s) => `${s.label || "Torque"}: ${s.primary}${s.secondary ? ` (${s.secondary})` : ""}`)
                .join("\n") ?? fastener.supersedes.oldValue}
            </div>
            <div className="locator">from {fastener.supersedes.oldSource}</div>
          </>
        )}
      </details>

      {nearby.length > 0 && (
        <div className="nearby" data-testid="nearby">
          <h3>Nearby in {assemblyCrumbs(fastener).slice(-1)[0]}</h3>
          <ul>
            {nearby.map((n) => (
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

      {showDiagnostics && (
        <div className="diag" data-testid="diagnostics">
          <span>top1 {diagnostics.top1.toFixed(3)}</span>
          <span>top2 {diagnostics.top2.toFixed(3)}</span>
          <span>margin {diagnostics.margin.toFixed(3)}</span>
          <span>
            thresholds {diagnostics.thresholds.top1}/{diagnostics.thresholds.margin}
          </span>
          <span>blocked {diagnostics.blocked}</span>
          <span>scanned {diagnostics.totalScanned}</span>
          <span>embeddings {diagnostics.usedEmbeddings ? "on" : "off"}</span>
        </div>
      )}
    </div>
  );
}
