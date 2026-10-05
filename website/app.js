/* Mockup renderer.
 *
 * The important property to notice: every number on screen comes from a typed
 * field in the payload, concatenated by a template. There is no code path where
 * model-generated text reaches the page. The real client works the same way —
 * see docs/04-accuracy-architecture.md.
 */

const el = document.getElementById("result");
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const tierChip = (t) => `<span class="tier tier-${esc(t)}">${esc(t)}</span>`;

const MATCH_TEXT = {
  high: "Confident match",
  medium: "Probable match",
  low: "Uncertain"
};

/* --- shared fragments ------------------------------------------------- */

function confidenceBlock(match, prov) {
  // Two axes, side by side, deliberately never blended into one score.
  return `
    <div class="confidence">
      <div class="conf">
        <div class="conf-label">Match confidence — is this your bolt?</div>
        <div class="conf-value">${esc(MATCH_TEXT[match.level] || match.level)}</div>
        <div class="conf-note">${esc(match.note)}</div>
      </div>
      <div class="conf">
        <div class="conf-label">Source confidence — where the number came from</div>
        <div class="conf-value">${tierChip(prov.tier)}${esc(prov.label)}</div>
        <div class="conf-note">${esc(prov.corroboration)}</div>
      </div>
    </div>`;
}

function sourceBlock(prov) {
  return `
    <details class="source">
      <summary>Show the original source text</summary>
      <div class="quote">${esc(prov.quote)}</div>
      <div class="locator">
        ${esc(prov.source)} · rev ${esc(prov.revision)}<br>${esc(prov.locator)}
      </div>
    </details>`;
}

function requirements(d) {
  const f = d.fastener;
  const rows = [];
  if (f.qty) rows.push(["Quantity", `${f.qty} per vehicle`]);
  if (f.thread_size) rows.push(["Thread size", f.thread_size]);
  if (d.sequence_note) rows.push(["Sequence", d.sequence_note]);
  if (d.threadlocker) rows.push(["Thread locker", d.threadlocker]);
  if (!rows.length) return "";
  return `<div class="reqs">${rows
    .map((r) => `<div class="req"><div class="req-k">${esc(r[0])}</div><div class="req-v">${esc(r[1])}</div></div>`)
    .join("")}</div>`;
}

function flags(d) {
  let out = "";

  if (d.fastener.reusable === false) {
    out += `<div class="flag flag-danger">
      <span class="flag-icon">⚠</span>
      <div><strong>Single use — do not reuse.</strong> This is a torque-to-yield fastener.
      It stretches permanently when tightened. Install new hardware.</div></div>`;
  }
  if (d.precondition) {
    out += `<div class="flag flag-warn">
      <span class="flag-icon">◆</span>
      <div><strong>Before tightening:</strong> ${esc(d.precondition)}</div></div>`;
  }
  if (d.supersedes) {
    out += `<div class="flag flag-info">
      <span class="flag-icon">⟳</span>
      <div><strong>Revised by bulletin.</strong> The ${esc(d.supersedes.date)} bulletin replaced the
      manual's <s>${esc(d.supersedes.old_value)}</s> with the value above.
      ${esc(d.supersedes.bulletin)}.</div></div>`;
  }
  return out;
}

function nearby(list) {
  if (!list || !list.length) return "";
  return `<div class="nearby"><h3>Nearby in this assembly</h3><ul>${list
    .map((n) => `<li><span>${esc(n.name)}</span><span>${esc(n.spec)}</span></li>`)
    .join("")}</ul></div>`;
}

/* A stand-in for the real extracted FSM figure with callout highlighting. */
function diagram(label) {
  return `
    <div class="diagram">
      <svg viewBox="0 0 400 130" role="img" aria-label="Assembly diagram placeholder">
        <rect x="0" y="0" width="400" height="130" fill="#11161d"/>
        <path d="M40 95 H360" stroke="#4a5666" stroke-width="7" stroke-linecap="round"/>
        <path d="M110 95 L135 40" stroke="#4a5666" stroke-width="5" stroke-linecap="round"/>
        <path d="M290 95 L265 40" stroke="#4a5666" stroke-width="5" stroke-linecap="round"/>
        <circle cx="110" cy="95" r="11" fill="none" stroke="#4ea1ff" stroke-width="2.5"/>
        <circle cx="110" cy="95" r="19" fill="none" stroke="#4ea1ff" stroke-width="1" opacity=".45"/>
        <text x="134" y="100" fill="#4ea1ff" font-size="12" font-family="monospace">1</text>
        <circle cx="135" cy="40" r="8" fill="none" stroke="#5c6676" stroke-width="2"/>
        <text x="150" y="44" fill="#8b98a9" font-size="12" font-family="monospace">2</text>
      </svg>
      <div class="diagram-cap">${esc(label)}</div>
    </div>`;
}

/* --- states ------------------------------------------------------------ */

function renderAnswer(d) {
  const primary = d.stages[0];
  const multi = d.stages.length > 1;

  const headline = multi
    ? `<div class="spec-value">${esc(d.stages.length)} stages</div>
       <div class="spec-alt">a single number would be wrong here — all stages required</div>`
    : `<div class="spec-value">${esc(primary.primary)}</div>
       <div class="spec-alt">${esc(primary.secondary)}</div>`;

  const stageList = multi
    ? `<div class="stages">${d.stages
        .map(
          (s) => `<div class="stage">
            <span class="stage-no">Stage ${esc(s.stage_no)}</span>
            <span class="stage-val">${esc(s.primary)}${s.secondary ? " · " + esc(s.secondary) : ""}</span>
            <span class="stage-note">${esc(s.note || "")}</span>
          </div>`
        )
        .join("")}</div>`
    : "";

  return `
    <div class="card">
      <div class="card-head">
        <div>
          <div class="oem-name">${esc(d.fastener.canonical_name)}</div>
          <div class="assembly-path">${esc(d.fastener.assembly_path)}</div>
        </div>
      </div>
      ${headline}
      ${stageList}
      ${flags(d)}
      ${requirements(d)}
      ${confidenceBlock(d.match, d.provenance)}
      ${sourceBlock(d.provenance)}
      ${nearby(d.nearby)}
    </div>`;
}

function renderAbstain(d) {
  return `
    <div class="card">
      <div class="flag flag-warn" style="margin-top:0">
        <span class="flag-icon">?</span>
        <div><strong>Not sure which bolt you mean — no answer given.</strong><br>${esc(d.reason)}</div>
      </div>
      ${diagram("Rear Suspension › Stabilizer Shaft — select a callout")}
      <div style="margin-top:16px">
        ${d.candidates
          .map(
            (c) => `<button class="cand">
              <span class="cand-rank">${esc(c.rank)}</span>
              <span class="cand-body">
                <span class="cand-name">${esc(c.name)}</span>
                <span class="cand-path">${tierChip(c.tier)}${esc(c.path)}</span>
              </span>
              <span class="cand-spec">${esc(c.spec)}</span>
            </button>`
          )
          .join("")}
      </div>
      <div class="locator" style="margin-top:12px">${esc(d.learn_note)}</div>
    </div>`;
}

function renderConflict(d) {
  return `
    <div class="card">
      <div class="card-head">
        <div>
          <div class="oem-name">${esc(d.fastener.canonical_name)}</div>
          <div class="assembly-path">${esc(d.fastener.assembly_path)}</div>
        </div>
      </div>
      <div class="flag flag-danger" style="margin-top:14px">
        <span class="flag-icon">⚠</span>
        <div><strong>Sources disagree — no single answer.</strong><br>${esc(d.reason)}</div>
      </div>
      <div class="versus">
        ${d.options
          .map(
            (o) => `<div>
              <div>${tierChip(o.tier)}<span class="conf-note">${esc(o.source)}</span></div>
              <div class="spec-value">${esc(o.value)}</div>
              <div class="spec-alt">${esc(o.alt)}</div>
              <div class="quote" style="margin-top:10px">${esc(o.quote)}</div>
              <div class="locator">rev ${esc(o.revision)}</div>
            </div>`
          )
          .join("")}
      </div>
      <div class="flag flag-info"><span class="flag-icon">i</span><div>${esc(d.guidance)}</div></div>
      <div class="locator" style="margin-top:10px">Resolve with <code>${esc(d.resolve_hint)}</code></div>
    </div>`;
}

/* --- wiring ------------------------------------------------------------ */

function show(stateKey) {
  const d = MOCK[stateKey];
  document.getElementById("q").value = d.query;

  if (d.outcome === "abstain") el.innerHTML = renderAbstain(d);
  else if (d.outcome === "conflict") el.innerHTML = renderConflict(d);
  else el.innerHTML = renderAnswer(d);

  document.querySelectorAll(".state-btn").forEach((b) =>
    b.classList.toggle("is-active", b.dataset.state === stateKey)
  );
}

document.querySelectorAll(".state-btn").forEach((b) =>
  b.addEventListener("click", () => show(b.dataset.state))
);

document.getElementById("search-form").addEventListener("submit", (e) => {
  e.preventDefault();
  // Mockup only: match the typed text against the canned queries.
  const q = document.getElementById("q").value.toLowerCase();
  const hit = Object.keys(MOCK).find((k) => MOCK[k].query.toLowerCase() === q);
  show(hit || "ambiguous");
});

show("confident");
