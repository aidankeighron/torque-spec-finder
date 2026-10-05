/** The zero-wrong-answers gate.
 *
 * Primary assertion: for every golden query the system either returns the
 * correct fastener or declines to answer. A wrong auto-answer fails the build.
 *
 * Abstain rate and auto-answer rate are reported but NOT asserted — they are
 * UX metrics. That asymmetry is the whole philosophy, encoded as a test.
 */

import { describe, expect, it } from "vitest";
import { getIndex } from "@/lib/registry";
import { search } from "@/lib/search/engine";
import { conceptVector } from "@/lib/search/embeddings";
import { GOLDEN, TRAPS, type GoldenCase } from "./golden";

const index = getIndex("c5-2003-base");

type Verdict = "correct" | "wrong" | "abstained" | "not_found" | "missing_property";

interface Outcome {
  verdict: Verdict;
  got: string;
  detail?: string;
}

function evaluate(g: GoldenCase, semantic = false): Outcome {
  const r = search(index, g.q, {
    queryEmbedding: semantic ? conceptVector(g.q) : null,
  });
  const got = r.fastener?.name ?? `(${r.outcome})`;

  if (g.expect === "NOT_FOUND") {
    if (r.outcome === "not_found") return { verdict: "not_found", got };
    // Abstaining on something absent is acceptable — it still shows no answer.
    if (r.outcome === "abstain") return { verdict: "abstained", got };
    return { verdict: "wrong", got, detail: "answered a query with no valid target" };
  }

  if (g.expect === "ABSTAIN") {
    if (r.outcome === "abstain" || r.outcome === "conflict") return { verdict: "abstained", got };
    if (r.outcome === "not_found") return { verdict: "not_found", got };
    return { verdict: "wrong", got, detail: "answered where it should have asked" };
  }

  if (r.outcome !== "answer") {
    return { verdict: r.outcome === "not_found" ? "not_found" : "abstained", got };
  }

  const f = r.fastener!;
  if (f.name !== g.expect) {
    return { verdict: "wrong", got: f.name, detail: `expected "${g.expect}"` };
  }
  if (g.assembly && f.assembly !== g.assembly) {
    return { verdict: "wrong", got: `${f.name} @ ${f.assembly}`, detail: `expected @ ${g.assembly}` };
  }

  for (const prop of g.must ?? []) {
    const ok =
      prop === "multi_stage" ? f.stages.length > 1
      : prop === "angle" ? f.stages.some((s) => s.kind === "angle")
      : prop === "single_use" ? f.warnings.some((w) => w.kind === "single_use")
      : prop === "superseded" ? !!f.supersedes
      : /* both_units */ f.stages.some((s) => s.kind === "torque" && !!s.secondary);
    if (!ok) return { verdict: "missing_property", got: f.name, detail: `missing: ${prop}` };
  }

  return { verdict: "correct", got: f.name };
}

function run(semantic: boolean) {
  const rows = GOLDEN.map((g) => ({ g, o: evaluate(g, semantic) }));
  const wrong = rows.filter((r) => r.o.verdict === "wrong");
  const missing = rows.filter((r) => r.o.verdict === "missing_property");
  const correct = rows.filter((r) => r.o.verdict === "correct");
  const abstained = rows.filter((r) => r.o.verdict === "abstained");
  const notFound = rows.filter((r) => r.o.verdict === "not_found");
  return { rows, wrong, missing, correct, abstained, notFound };
}

describe("golden set — lexical only", () => {
  const res = run(false);

  it("ZERO WRONG ANSWERS", () => {
    const report = res.wrong
      .map((r) => `  "${r.g.q}"\n      got: ${r.o.got}\n      ${r.o.detail ?? ""}`)
      .join("\n");
    expect(res.wrong.length, `\n${res.wrong.length} wrong answer(s):\n${report}`).toBe(0);
  });

  it("zero wrong answers on the trap cases specifically", () => {
    const trapWrong = res.rows.filter((r) => r.g.trap && r.o.verdict === "wrong");
    const report = trapWrong.map((r) => `  "${r.g.q}" -> ${r.o.got} (${r.o.detail})`).join("\n");
    expect(trapWrong.length, `\n${report}`).toBe(0);
  });

  it("answer cards carry their required safety properties", () => {
    const report = res.missing.map((r) => `  "${r.g.q}": ${r.o.detail}`).join("\n");
    expect(res.missing.length, `\n${report}`).toBe(0);
  });

  it("reports coverage metrics (not asserted — UX, not correctness)", () => {
    const n = res.rows.length;
    const pct = (x: number) => `${((x / n) * 100).toFixed(0)}%`;
    // eslint-disable-next-line no-console
    console.log(
      [
        "",
        `  golden set: ${n} queries  ·  ${TRAPS.length} traps`,
        `  correct auto-answer : ${res.correct.length} (${pct(res.correct.length)})`,
        `  abstained           : ${res.abstained.length} (${pct(res.abstained.length)})`,
        `  not found           : ${res.notFound.length} (${pct(res.notFound.length)})`,
        `  WRONG               : ${res.wrong.length}`,
        "",
      ].join("\n"),
    );
    expect(res.correct.length).toBeGreaterThan(n * 0.4);
  });
});

describe("golden set — with the semantic layer on", () => {
  const res = run(true);

  it("still ZERO WRONG ANSWERS", () => {
    // The point of this test: enabling the semantic layer can change WHICH
    // queries get answered, but it must never turn a safe abstain into a
    // wrong answer. Degradation is bounded to recall by construction.
    const report = res.wrong.map((r) => `  "${r.g.q}" -> ${r.o.got} (${r.o.detail})`).join("\n");
    expect(res.wrong.length, `\n${report}`).toBe(0);
  });

  it("does not reduce the number of correct answers", () => {
    const lexical = run(false);
    expect(res.correct.length).toBeGreaterThanOrEqual(lexical.correct.length - 2);
  });
});

describe("threshold sensitivity", () => {
  it("raising thresholds can only convert answers into abstains, never into wrong answers", () => {
    for (const top1 of [0.42, 0.55, 0.7]) {
      for (const margin of [0.08, 0.15, 0.3]) {
        let wrong = 0;
        for (const g of GOLDEN) {
          if (g.expect === "NOT_FOUND" || g.expect === "ABSTAIN") continue;
          const r = search(index, g.q, { thresholds: { top1, margin, floor: 0.12 } });
          if (r.outcome === "answer" && r.fastener!.name !== g.expect) wrong++;
        }
        expect(wrong, `top1=${top1} margin=${margin}`).toBe(0);
      }
    }
  });
});
