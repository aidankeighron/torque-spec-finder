/* Static mock payloads — exactly the shape the real API will return.
   Note what is NOT here: any free-text "answer" string. The client renders
   from typed fields, so there is no place for generated prose to appear. */

const MOCK = {

  /* 1 — every gate passed, single answer */
  confident: {
    outcome: "answer",
    query: "rear sway bar bottom bolt",
    fastener: {
      canonical_name: "Rear Stabilizer Shaft Link Lower Nut",
      assembly_path: "Chassis › Rear Suspension › Stabilizer Shaft",
      qty: 2,
      thread_size: "M10 x 1.5",
      reusable: true,
      position: { vertical: "lower", longitude: "rear" }
    },
    stages: [
      { stage_no: 1, kind: "torque", primary: "53 N·m", secondary: "39 lb ft" }
    ],
    precondition: "Vehicle at curb height, suspension loaded. Torquing with the suspension hanging preloads the bushing and is a failed repair even at the correct value.",
    threadlocker: null,
    sequence_note: null,
    match: {
      level: "high",
      note: "Exact position match on two axes (rear, lower). Next candidate scored far behind."
    },
    provenance: {
      tier: "A",
      label: "OEM — human verified",
      source: "GM Service Manual, 2003 Corvette · Rear Suspension",
      revision: "2003-08",
      corroboration: "Confirmed by 2 independent sources",
      quote: "Rear Stabilizer Shaft Link Lower Nut .......... 53 N·m (39 lb ft)",
      locator: "Section 4 — Rear Suspension › Fastener Tightening Specifications › p. 4-3"
    },
    nearby: [
      { name: "Rear Stabilizer Shaft Link Upper Nut", spec: "53 N·m (39 lb ft)" },
      { name: "Rear Stabilizer Shaft Insulator Clamp Bolt", spec: "50 N·m (37 lb ft)" },
      { name: "Rear Stabilizer Shaft Bracket Bolt", spec: "60 N·m (44 lb ft)" }
    ]
  },

  /* 2 — gate failed, you pick. The abstain path is a feature. */
  ambiguous: {
    outcome: "abstain",
    query: "sway bar bolt",
    reason: "Four fasteners in this assembly matched closely and your question didn't specify a position. Pick the one you're looking at.",
    candidates: [
      { rank: 1, name: "Rear Stabilizer Shaft Link Lower Nut",        path: "Rear Suspension › Stabilizer Shaft", spec: "53 N·m (39 lb ft)", tier: "A" },
      { rank: 2, name: "Rear Stabilizer Shaft Link Upper Nut",        path: "Rear Suspension › Stabilizer Shaft", spec: "53 N·m (39 lb ft)", tier: "A" },
      { rank: 3, name: "Rear Stabilizer Shaft Insulator Clamp Bolt",  path: "Rear Suspension › Stabilizer Shaft", spec: "50 N·m (37 lb ft)", tier: "A" },
      { rank: 4, name: "Front Stabilizer Shaft Link Nut",             path: "Front Suspension › Stabilizer Shaft", spec: "17 N·m (13 lb ft)", tier: "A" }
    ],
    learn_note: "Whichever you pick is saved as an alias, so this phrasing resolves directly next time."
  },

  /* 3 — sources disagree. The system KNOWS, and says so. */
  conflict: {
    outcome: "conflict",
    query: "rear shock lower mounting bolt",
    fastener: {
      canonical_name: "Rear Shock Absorber Lower Mounting Bolt",
      assembly_path: "Chassis › Rear Suspension › Shock Absorber"
    },
    reason: "Two independent sources give different values for this fastener on your vehicle. No single answer will be shown until this is resolved.",
    options: [
      { value: "220 N·m", alt: "162 lb ft", tier: "A",
        source: "GM Service Manual, 2003 Corvette", revision: "2003-08",
        quote: "Rear Shock Absorber Lower Mounting Bolt ... 220 N·m (162 lb ft)" },
      { value: "95 N·m", alt: "70 lb ft", tier: "D",
        source: "CorvetteForum consolidated spec sheet", revision: "unknown",
        quote: "rear shock bottom bolt — 70 ft lbs" }
    ],
    guidance: "Tier A (OEM, verified) outranks tier D (community). The likely explanation is that the community sheet confuses this with the upper mount. Resolve by checking a second OEM source.",
    resolve_hint: "torque ingest conflicts --resolve 1842"
  },

  /* 4 — the FSM value is real, documented, and WRONG. */
  superseded: {
    outcome: "answer",
    query: "front lower ball joint nut",
    fastener: {
      canonical_name: "Front Lower Ball Joint Stud Nut",
      assembly_path: "Chassis › Front Suspension › Lower Control Arm",
      qty: 2,
      thread_size: "M14 x 1.5",
      reusable: false,
      position: { vertical: "lower", longitude: "front" }
    },
    stages: [
      { stage_no: 1, kind: "torque", primary: "100 N·m", secondary: "74 lb ft" }
    ],
    supersedes: {
      old_value: "50 N·m (37 lb ft)",
      old_source: "GM Service Manual, 2003 Corvette",
      bulletin: "GM Service Bulletin — Revised Ball-Joint Torque Specs (1997–2005)",
      date: "2005"
    },
    precondition: "Threads clean and dry.",
    match: { level: "high", note: "Unambiguous name and position match." },
    provenance: {
      tier: "A",
      label: "OEM bulletin — supersedes manual",
      source: "GM Service Bulletin, revised ball-joint specifications",
      revision: "2005",
      corroboration: "Bulletin explicitly supersedes the manual value",
      quote: "The front and rear suspension upper and lower ball joint stud nut tightening\nspecifications have been revised.\n  Front Lower Ball Joint Stud Nut .......... 100 N·m (74 lb ft)",
      locator: "Service Bulletin › Suspension › Ball Joint Stud Nut"
    },
    nearby: [
      { name: "Front Upper Ball Joint Stud Nut", spec: "50 N·m (37 lb ft)" },
      { name: "Lower Control Arm Bolt", spec: "page: at curb height" }
    ]
  },

  /* 5 — where a bare number is itself a wrong answer */
  multistage: {
    outcome: "answer",
    query: "head bolts",
    fastener: {
      canonical_name: "Cylinder Head Bolt (M11)",
      assembly_path: "Engine › Cylinder Head › LS1 5.7L",
      qty: 10,
      thread_size: "M11 x 2.0",
      reusable: false,
      position: {}
    },
    stages: [
      { stage_no: 1, kind: "torque", primary: "30 N·m", secondary: "22 lb ft", note: "all bolts, in sequence" },
      { stage_no: 2, kind: "angle",  primary: "+90°",   note: "all bolts, in sequence" },
      { stage_no: 3, kind: "angle",  primary: "+90°",   note: "bolts 1–5 only" },
      { stage_no: 4, kind: "angle",  primary: "+50°",   note: "bolts 6–10 only" }
    ],
    sequence_note: "Follow the numbered tightening sequence in Figure 2. Out-of-sequence tightening warps the deck.",
    precondition: "Threads clean and dry. New bolts only.",
    match: { level: "high", note: "Single cylinder head bolt spec for this engine." },
    provenance: {
      tier: "A",
      label: "OEM — human verified",
      source: "GM Service Manual, 2003 Corvette · Engine Mechanical 5.7L",
      revision: "2003-08",
      corroboration: "Confirmed by 2 independent sources",
      quote: "Tighten the cylinder head bolts in sequence to 30 N·m (22 lb ft). Tighten all bolts a second pass 90 degrees. Tighten bolts 1–5 an additional 90 degrees and bolts 6–10 an additional 50 degrees.",
      locator: "Engine Mechanical 5.7L › Cylinder Head Installation › Step 7"
    },
    nearby: [
      { name: "Cylinder Head Bolt (M8)", spec: "30 N·m (22 lb ft)" },
      { name: "Rocker Arm Bolt", spec: "30 N·m (22 lb ft)" },
      { name: "Intake Manifold Bolt", spec: "10 N·m (89 lb in)" }
    ]
  }
};
