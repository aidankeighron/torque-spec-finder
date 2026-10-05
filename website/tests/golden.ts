/** The golden query set.
 *
 * `expect` is the fastener NAME the query should resolve to (plus an optional
 * assembly where the name alone is ambiguous), or the literal "ABSTAIN" when
 * the honest outcome is a candidate list, or "NOT_FOUND" when the data simply
 * does not contain it.
 *
 * Two kinds of entry matter most:
 *
 *  - TRAPS. Near-miss pairs that any similarity measure rates almost
 *    identically — upper vs lower, front vs rear. These are the only realistic
 *    wrong-answer mode, so they carry the most weight.
 *
 *  - ABSTAIN cases. Queries where several genuinely distinct fasteners match.
 *    Expecting an answer here would be asking the system to guess. "rear sway
 *    bar bottom bolt" — the query that motivated this whole project — is one of
 *    them: the rear stabilizer bar has a link nut, an upper clamp bolt and a
 *    lower clamp nut, and "bottom bolt" does not pick between them.
 */

export type Expectation = string | "ABSTAIN" | "NOT_FOUND";

export interface GoldenCase {
  q: string;
  expect: Expectation;
  assembly?: string;
  /** Marks a deliberate near-miss. Reported separately. */
  trap?: boolean;
  /** Properties the answer card must carry. */
  must?: Array<"multi_stage" | "angle" | "single_use" | "superseded" | "both_units">;
  why?: string;
}

export const GOLDEN: GoldenCase[] = [
  /* ---------- wheels ---------- */
  { q: "lug nuts", expect: "Wheel Nuts In Sequence", must: ["both_units"] },
  { q: "lug nut torque", expect: "Wheel Nuts In Sequence" },
  { q: "wheel nuts", expect: "Wheel Nuts In Sequence" },
  { q: "what do I torque my lug nuts to", expect: "Wheel Nuts In Sequence" },

  /* ---------- suspension: the traps ---------- */
  {
    q: "front lower ball joint", expect: "Lower Control Arm Ball Joint Stud Nut",
    assembly: "Chassis > Front Suspension", trap: true, must: ["superseded", "angle"],
    why: "upper/lower AND front/rear both in play; four near-identical records",
  },
  {
    q: "front upper ball joint", expect: "Upper Control Arm Ball Joint Stud Nut",
    assembly: "Chassis > Front Suspension", trap: true, must: ["superseded", "angle"],
  },
  {
    q: "rear lower ball joint", expect: "Lower Control Arm Ball Joint Stud Nut",
    assembly: "Chassis > Rear Suspension", trap: true, must: ["superseded"],
  },
  {
    q: "rear upper ball joint", expect: "Upper Control Arm Ball Joint Stud Nut",
    assembly: "Chassis > Rear Suspension", trap: true, must: ["superseded"],
  },
  { q: "ball joint", expect: "ABSTAIN", trap: true, why: "four of them, no position given" },

  {
    q: "rear shock bottom bolt", expect: "Shock Absorber Lower Mounting Bolt",
    assembly: "Chassis > Rear Suspension", trap: true,
  },
  {
    q: "rear shock top bolts", expect: "Shock Absorber Upper Mounting Bolts",
    assembly: "Chassis > Rear Suspension", trap: true,
  },
  {
    q: "front shock lower nuts", expect: "Shock Absorber Lower Mounting Nuts",
    assembly: "Chassis > Front Suspension", trap: true,
  },
  {
    q: "driver side front shock top", expect: "Shock Absorber Upper Mounting Nut",
    assembly: "Chassis > Front Suspension", trap: true,
  },
  { q: "shock absorber bolt", expect: "ABSTAIN", trap: true },

  {
    q: "rear sway bar bottom bolt", expect: "ABSTAIN", trap: true,
    why: "THE motivating query. Rear bar has a link nut, an upper clamp bolt and a lower clamp nut — 'bottom bolt' does not disambiguate, so asking is the correct behaviour",
  },
  { q: "sway bar end link", expect: "Stabilizer Shaft Link Nuts" },
  { q: "rear sway bar lower clamp", expect: "Stabilizer Shaft Insulator (Lower) Clamp Nut", trap: true },
  { q: "rear sway bar upper clamp", expect: "Stabilizer Shaft Insulator (Upper) Clamp Bolt", trap: true },
  { q: "sway bar bolt", expect: "ABSTAIN", trap: true },

  { q: "upper control arm mounting bolts front", expect: "Upper Control Arm Mounting Bolts", trap: true },
  { q: "rear lower control arm front cam bolt", expect: "Lower Control Arm (Front) Cam Bolt Nut", trap: true },
  { q: "rear lower control arm rear cam bolt", expect: "Lower Control Arm (Rear) Cam Bolt Nut", trap: true },
  { q: "tie rod jam nut", expect: "ABSTAIN", trap: true, why: "front and rear both exist" },

  /* ---------- brakes ---------- */
  { q: "brake caliper bracket", expect: "ABSTAIN", trap: true, why: "front and rear, same value" },
  { q: "front brake caliper bracket bolt", expect: "Front Brake Caliper Mounting Bracket Bolt", trap: true },
  { q: "rear brake caliper bracket bolt", expect: "Rear Brake Caliper Mounting Bracket Bolt", trap: true },
  { q: "caliper bleeder", expect: "Brake Caliper Bleed Screw" },
  { q: "banjo bolt", expect: "Brake Caliper Inlet Fitting Bolt" },
  { q: "brake hose fitting", expect: "Brake Caliper Inlet Fitting Bolt" },

  /* ---------- engine ---------- */
  {
    q: "head bolts", expect: "ABSTAIN", trap: true,
    why: "the M11 and M8 bolts are separate specs; both are 'head bolts'",
  },
  {
    q: "cylinder head bolts m11", expect: "Cylinder Head Bolts",
    must: ["multi_stage", "angle", "single_use"],
  },
  { q: "rod bolts", expect: "Connecting Rod Bolts", must: ["multi_stage", "angle", "single_use", "superseded"] },
  { q: "harmonic balancer", expect: "Crankshaft Balancer Bolt", must: ["multi_stage", "single_use"] },
  { q: "crank pulley bolt", expect: "Crankshaft Balancer Bolt" },
  { q: "main cap bolts", expect: "ABSTAIN", trap: true, why: "inner bolts, outer studs and side bolts" },
  { q: "intake manifold", expect: "Intake Manifold Bolts" },
  { q: "water pump", expect: "Water Pump Bolt", must: ["multi_stage"] },
  { q: "thermostat housing", expect: "Water Inlet Housing Bolts" },
  { q: "valve cover", expect: "Valve Rocker Arm Cover Bolts" },
  { q: "rocker arm bolts", expect: "Valve Rocker Arm Bolts" },
  { q: "spark plugs", expect: "ABSTAIN", trap: true, why: "new head vs subsequent installs differ" },
  { q: "oil pan drain plug", expect: "Oil Pan Drain Plug" },
  { q: "motor mount", expect: "ABSTAIN", trap: true },
  { q: "camshaft sprocket bolts", expect: "Camshaft Sprocket Bolts" },
  { q: "knock sensor", expect: "Knock Sensor" },

  /* ---------- driveline ---------- */
  { q: "diff pinion nut", expect: "Pinion Nut" },
  { q: "ring gear bolts", expect: "Ring Gear Bolts" },
  { q: "diff cover bolts", expect: "Cover Bolts and Stud" },
  { q: "differential case bolts", expect: "Differential Case Bolts" },
  { q: "clutch pressure plate", expect: "Clutch Pressure Plate Bolts" },
  { q: "rear axle nut", expect: "Rear Drive Shaft Spindle Nut" },

  /* ---------- steering ---------- */
  { q: "steering rack bolts", expect: "Power Steering Gear Mounting Bolts" },
  { q: "steering wheel nut", expect: "Steering Wheel Nut" },

  /* ---------- queries that must NOT answer ---------- */
  { q: "that bolt near the thing", expect: "NOT_FOUND", trap: true, why: "no part named at all" },
  { q: "bolt", expect: "NOT_FOUND", trap: true, why: "generic word only" },
  { q: "nuts and bolts", expect: "NOT_FOUND", trap: true },
  { q: "blah blah nonsense", expect: "NOT_FOUND" },
  { q: "timing belt tensioner", expect: "NOT_FOUND", why: "LS1 has a timing CHAIN; no such part" },
  { q: "glow plugs", expect: "NOT_FOUND", why: "petrol engine" },
  { q: "turbo wastegate", expect: "NOT_FOUND", why: "naturally aspirated" },

  /* ---------- wrong-vehicle probes ---------- */
  { q: "trailing arm pivot bolt", expect: "NOT_FOUND", why: "C3 part, not C5" },
  { q: "pitman arm nut", expect: "NOT_FOUND", why: "C3 steering, C5 is rack and pinion" },
];

export const TRAPS = GOLDEN.filter((g) => g.trap);
