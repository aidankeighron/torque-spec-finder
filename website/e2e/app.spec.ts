import { expect, test, type Page } from "@playwright/test";

async function look(page: Page, query: string) {
  await page.getByTestId("search-input").fill(query);
  await page.getByTestId("search-submit").click();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("vehicle-select")).toBeVisible();
});

test("loads with the C5 selected and its real fastener count", async ({ page }) => {
  await expect(page.getByTestId("vehicle-select")).toHaveValue("c5-2003-base");
  await expect(page.getByTestId("fastener-count")).toContainText("fasteners");
  const text = await page.getByTestId("fastener-count").innerText();
  expect(Number(text.split(" ")[0])).toBeGreaterThan(650);
});

test("confident answer shows the value, both units, and provenance", async ({ page }) => {
  await look(page, "lug nuts");
  const card = page.getByTestId("answer-card");
  await expect(card).toBeVisible();
  await expect(page.getByTestId("fastener-name")).toHaveText("Wheel Nuts In Sequence");
  // Units read lb-ft, then lb-in, then N·m. A lug nut has no useful lb-in
  // conversion (it would be ~1239), so this record shows two columns.
  const units = page.getByTestId("unit-row").first().locator(".unit");
  await expect(units).toHaveCount(2);
  await expect(units.nth(0).locator(".unit-value")).toHaveText("100");
  await expect(units.nth(0).locator(".unit-label")).toContainText("lb ft");
  await expect(units.nth(1).locator(".unit-value")).toHaveText("140");
  await expect(units.nth(1).locator(".unit-label")).toContainText("N·m");
  // Both confidence axes must be present and separate.
  await expect(card).toContainText("Match confidence");
  await expect(card).toContainText("Source confidence");
  await expect(page.getByTestId("match-confidence")).toBeVisible();
  // Provenance must be reachable. (A closed <details> exposes only its
  // summary to text assertions, so target the summary directly.)
  await expect(page.locator("details.source > summary")).toContainText("original source text");
});

test("the verbatim source line is viewable", async ({ page }) => {
  await look(page, "lug nuts");
  await page.getByTestId("source-details").locator("summary").click();
  await expect(page.getByTestId("source-details")).toContainText("Wheel Nuts In Sequence");
  await expect(page.getByTestId("source-details")).toContainText("140");
});

test("multi-stage fastener shows every stage, never a single number", async ({ page }) => {
  await look(page, "cylinder head bolts m11");
  await expect(page.getByTestId("answer-card")).toBeVisible();
  await expect(page.getByTestId("stages")).toContainText("All 4 stages are required");
  const stages = page.getByTestId("stages").locator(".stage");
  await expect(stages).toHaveCount(4);
  // Stage 1 is a torque with unit columns; stages 2-4 are angles.
  const first = stages.nth(0).locator(".unit");
  await expect(first.nth(0).locator(".unit-value")).toHaveText("22");
  await expect(first.nth(0).locator(".unit-label")).toContainText("lb ft");
  await expect(first.last().locator(".unit-value")).toHaveText("30");
  await expect(first.last().locator(".unit-label")).toContainText("N·m");
  await expect(page.getByTestId("stages")).toContainText("+90°");
  await expect(page.getByTestId("stages")).toContainText("+50°");
  // And the safety warnings that make the number usable.
  await expect(page.getByTestId("warning-torque_angle")).toBeVisible();
  await expect(page.getByTestId("warning-single_use")).toContainText("do not reuse");
});

test("supersession banner shows the revised value and what it replaced", async ({ page }) => {
  await look(page, "front lower ball joint");
  await expect(page.getByTestId("answer-card")).toBeVisible();
  const banner = page.getByTestId("supersession");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("Revised by a GM service bulletin");
  // The stale value must still be visible, struck through.
  await expect(banner.locator("s")).toBeVisible();
  await expect(page.getByTestId("stages")).toContainText("+180°");
});

test("ABSTAINS on the motivating query rather than guessing", async ({ page }) => {
  await look(page, "rear sway bar bottom bolt");
  await expect(page.getByTestId("abstain-card")).toBeVisible();
  await expect(page.getByTestId("answer-card")).toHaveCount(0);
  await expect(page.getByTestId("abstain-card")).toContainText("no answer given");
  // Candidates must be offered, with their specs already visible.
  const cands = page.getByTestId("candidate-list").locator(".cand");
  expect(await cands.count()).toBeGreaterThan(1);
  // Candidate rows lead with the printed foot-pound figure.
  await expect(cands.first()).toContainText(/lb (ft|in)/);
});

test("picking a candidate resolves to that exact record", async ({ page }) => {
  await look(page, "rear sway bar bottom bolt");
  const first = page.getByTestId("candidate-list").locator(".cand").first();
  const name = (await first.locator(".cand-name").innerText()).trim();
  await first.click();
  await expect(page.getByTestId("answer-card")).toBeVisible();
  await expect(page.getByTestId("fastener-name")).toHaveText(name);
});

test("position words are enforced, not merely hinted", async ({ page }) => {
  await look(page, "rear shock bottom bolt");
  await expect(page.getByTestId("fastener-name")).toHaveText("Shock Absorber Lower Mounting Bolt");
  await expect(page.getByTestId("answer-card")).toContainText("162");
  await expect(page.getByTestId("answer-card")).toContainText("220");
  // The opposite end must give a different record, not the same one.
  await look(page, "rear shock top bolts");
  await expect(page.getByTestId("fastener-name")).toHaveText("Shock Absorber Upper Mounting Bolts");
  await expect(page.getByTestId("answer-card")).toContainText("22");
});

test("a part this car does not have is reported as absent, not approximated", async ({ page }) => {
  await look(page, "trailing arm pivot bolt");
  await expect(page.getByTestId("answer-card")).toHaveCount(0);
  const body = page.locator("main");
  await expect(body).toContainText(/not in this vehicle|Not sure which fastener/i);
  await expect(body).not.toContainText("Headlamp Motor/Actuator to Pivot Arm Nut >");
});

test("nonsense yields not-found and says nothing is estimated", async ({ page }) => {
  await look(page, "blah blah nonsense");
  await expect(page.getByTestId("not-found-card")).toBeVisible();
  await expect(page.getByTestId("not-found-card")).toContainText("No value is estimated");
});

test("a generic query is refused rather than answered", async ({ page }) => {
  await look(page, "that bolt near the thing");
  await expect(page.getByTestId("answer-card")).toHaveCount(0);
});

test("nearby fasteners are listed and clickable", async ({ page }) => {
  await look(page, "rear shock bottom bolt");
  const nearby = page.getByTestId("nearby");
  await expect(nearby).toBeVisible();
  const items = nearby.locator("li button");
  expect(await items.count()).toBeGreaterThan(2);
  await items.first().click();
  await expect(page.getByTestId("answer-card")).toBeVisible();
});

test("diagnostics toggle exposes the scores behind the decision", async ({ page }) => {
  await look(page, "lug nuts");
  await expect(page.getByTestId("diagnostics")).toHaveCount(0);
  await page.getByTestId("diagnostics-toggle").check();
  await expect(page.getByTestId("diagnostics")).toContainText("top1");
  await expect(page.getByTestId("diagnostics")).toContainText("margin");
});

test("semantic toggle does not break search", async ({ page }) => {
  await page.getByTestId("semantic-toggle").check();
  await look(page, "harmonic balancer");
  await expect(page.getByTestId("answer-card")).toBeVisible();
  await expect(page.getByTestId("fastener-name")).toHaveText("Crankshaft Balancer Bolt");
});

test("browse tab lists assemblies and drills into a record", async ({ page }) => {
  await page.getByTestId("tab-browse").click();
  const groups = page.getByTestId("browse").locator("details");
  expect(await groups.count()).toBeGreaterThan(20);
  const target = page.getByTestId("browse").locator("details", { hasText: "Front Suspension" }).first();
  await target.locator("summary").click();
  await target.locator("button").first().click();
  await expect(page.getByTestId("answer-card")).toBeVisible();
});

test("coverage tab reports real stats and lists sources with links", async ({ page }) => {
  await page.getByTestId("tab-coverage").click();
  const cov = page.getByTestId("coverage");
  await expect(cov).toContainText("Fasteners");
  await expect(cov).toContainText("Superseded by TSB");
  // The GM bulletins must be cited with working external links.
  const links = cov.locator('a[href^="https://"]');
  expect(await links.count()).toBeGreaterThan(3);
  await expect(cov).toContainText("Deliberately NOT ingested");
});

test("VEHICLE SEGREGATION: switching to the C3 clears results and shows no data", async ({ page }) => {
  await look(page, "lug nuts");
  await expect(page.getByTestId("answer-card")).toBeVisible();

  await page.getByTestId("vehicle-select").selectOption("c3-1979-base-auto");
  // The previous car's answer must not survive the switch.
  await expect(page.getByTestId("answer-card")).toHaveCount(0);
  await expect(page.getByTestId("search-input")).toHaveValue("");
  await expect(page.locator("main")).toContainText("No specs ingested");
  await expect(page.getByTestId("fastener-count")).toContainText("0 fasteners");

  // And searching the C3 cannot surface C5 data.
  await expect(page.getByTestId("search-submit")).toBeDisabled();
});

test("switching back to the C5 restores a working search", async ({ page }) => {
  await page.getByTestId("vehicle-select").selectOption("c3-1979-base-auto");
  await page.getByTestId("vehicle-select").selectOption("c5-2003-base");
  await look(page, "intake manifold");
  await expect(page.getByTestId("fastener-name")).toHaveText("Intake Manifold Bolts");
});

test("no numeral on screen is absent from the record (output guard holds live)", async ({ page }) => {
  for (const q of ["lug nuts", "cylinder head bolts m11", "front lower ball joint", "rod bolts"]) {
    await look(page, q);
    await expect(page.getByTestId("answer-card")).toBeVisible();
    // A guard violation renders a block message instead of the card.
    await expect(page.locator("main")).not.toContainText("Blocked by the output guard");
  }
});

test("stress: many queries in sequence never produce an unhandled error", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  const queries = [
    "", " ", "a", "!!!", "N·m", "140", "140 lb ft", "°", "½",
    "lug nuts", "LUG NUTS", "  lug   nuts  ", "lugnuts", "lug-nuts",
    "sway bar", "swaybar", "stabalizer shaft", "anti roll bar",
    "head bolt", "head bolts", "cylinder head", "M11 head bolts",
    "rear", "front", "upper", "lower", "left", "right",
    "front and rear brakes", "driver side passenger side",
    "what is the torque spec for the rear sway bar bottom bolt on my 2003 corvette",
    "x".repeat(300),
    "bolt bolt bolt bolt", "<script>alert(1)</script>", "'; DROP TABLE--",
    "ball joint", "balljoint", "ball-joint", "spindle nut", "pinion",
    "差速器", "🔧🔧", "null", "undefined", "NaN", "Infinity",
  ];
  for (const q of queries) {
    await page.getByTestId("search-input").fill(q);
    await page.getByTestId("search-submit").click();
    // Something must always render, and it must never be a crash.
    await expect(page.locator("main")).toBeVisible();
  }
  expect(errors, errors.join("\n")).toEqual([]);
});

test("stress: XSS payloads are escaped, not executed", async ({ page }) => {
  let alerted = false;
  page.on("dialog", async (d) => {
    alerted = true;
    await d.dismiss();
  });
  await look(page, "<img src=x onerror=alert(1)>");
  await expect(page.locator("main")).toBeVisible();
  expect(alerted).toBe(false);
});

test("UNIT ORDER: foot-pounds, then inch-pounds, then Newton-metres", async ({ page }) => {
  // A low-torque fastener printed in lb-in: shows the converted lb-ft FIRST,
  // then the printed lb-in, then N·m.
  await look(page, "caliper bleeder");
  await expect(page.getByTestId("fastener-name")).toHaveText("Brake Caliper Bleed Screw");
  const units = page.getByTestId("unit-row").first().locator(".unit");
  await expect(units).toHaveCount(3);
  await expect(units.nth(0).locator(".unit-label")).toContainText("lb ft");
  await expect(units.nth(1).locator(".unit-label")).toContainText("lb in");
  await expect(units.nth(2).locator(".unit-label")).toContainText("N·m");
  await expect(units.nth(1).locator(".unit-value")).toHaveText("106");
  await expect(units.nth(2).locator(".unit-value")).toHaveText("12");
});

test("converted values are visibly marked, printed ones are not", async ({ page }) => {
  await look(page, "caliper bleeder");
  const units = page.getByTestId("unit-row").first().locator(".unit");
  const derived = units.nth(0);
  await expect(derived).toHaveAttribute("data-printed", "false");
  await expect(derived.locator(".unit-value")).toContainText("≈");
  await expect(derived.locator(".unit-flag")).toHaveText("converted");
  for (const i of [1, 2]) {
    await expect(units.nth(i)).toHaveAttribute("data-printed", "true");
    await expect(units.nth(i).locator(".unit-flag")).toHaveCount(0);
  }
});

test("unit values render in white", async ({ page }) => {
  await look(page, "lug nuts");
  const v = page.getByTestId("unit-row").first().locator(".unit-value").first();
  await expect(v).toHaveCSS("color", "rgb(255, 255, 255)");
});

test("unit columns sit horizontally side by side", async ({ page }) => {
  await look(page, "caliper bleeder");
  const units = page.getByTestId("unit-row").first().locator(".unit");
  const boxes = await units.all();
  const rects = await Promise.all(boxes.map((b) => b.boundingBox()));
  // Same row: tops aligned, lefts strictly increasing.
  for (let i = 1; i < rects.length; i++) {
    expect(Math.abs(rects[i]!.y - rects[0]!.y)).toBeLessThan(4);
    expect(rects[i]!.x).toBeGreaterThan(rects[i - 1]!.x);
  }
});

test("angle stages are shown as turns, not forced into unit columns", async ({ page }) => {
  await look(page, "front lower ball joint");
  const rows = page.getByTestId("stages").locator(".stage");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1)).toContainText("+180°");
  await expect(rows.nth(1)).toContainText("turn, after the previous stage");
});

test("favicon, manifest and OG image are served", async ({ page, request }) => {
  for (const path of ["/icon.svg", "/icon-192.png", "/favicon.ico", "/og.png", "/manifest.webmanifest"]) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(200);
  }
  await page.goto("/");
  await expect(page.locator('link[rel="icon"][href="/icon.svg"]')).toHaveCount(1);
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
});

test("link preview metadata is present and absolute", async ({ page }) => {
  await page.goto("/");
  const og = (n: string) => page.locator(`meta[property="og:${n}"]`).first();
  await expect(og("title")).toHaveAttribute("content", /Torque Spec Finder/);
  await expect(og("description")).toHaveAttribute("content", /refuses to guess|traced to/);
  // Crawlers ignore relative image URLs, so this must be absolute.
  await expect(og("image")).toHaveAttribute("content", /^https?:\/\/.+\/og\.png$/);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    "content",
    "summary_large_image",
  );
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /torque/i);
});
