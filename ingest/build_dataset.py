"""Turn parsed FSM rows into the baked dataset the website ships.

Responsibilities:
  * Group multi-stage fasteners (parent + bullet stages) into one record.
  * Assign each fastener to a canonical assembly, by NAME first and section
    second — the FSM repeats a spec in every procedure section that touches it,
    so the section alone is not a reliable home for a fastener.
  * Extract position axes (upper/lower, front/rear, LH/RH, inboard/outboard)
    for the deterministic position gate.
  * Detect intra-document conflicts and corroboration.
  * Derive safety metadata (single-use, torque-angle, sequence) from source text.

Hard rule: this script never invents or alters a torque value. Values are
copied verbatim. Where the source is internally inconsistent, the record is
flagged so the UI can warn, and the number is still shown exactly as printed.
"""

from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PARSED = ROOT / "data" / "parsed" / "c5-2003-fsm-rows.json"
OUT = ROOT / "website" / "data" / "c5-2003-base.json"

VEHICLE = {
    "id": "c5-2003-base",
    "label": "2003 Chevrolet Corvette — Base",
    "shortLabel": "2003 C5 Base",
    "platform": "C5 Corvette",
    "generation": "C5",
    "year": 2003,
    "make": "Chevrolet",
    "model": "Corvette",
    "trim": "Base",
    "engine": "LS1 5.7L V8",
    "transmissions": ["MN6 6-speed manual", "M30 4-speed automatic"],
    "yearsCovered": "2003",
    "notes": "Specs from the 2003 Corvette Fastener Tightening Specifications. "
             "Z06 differs in several suspension and brake specs and is not covered here.",
}

SOURCE_FSM = {
    "id": "c5-fsm-2003-fasteners",
    "tier": "B",
    "kind": "fsm",
    "title": "2003 Corvette Fastener Tightening Specifications",
    "publisher": "General Motors",
    "revision": "2003",
    "sha256": "65bc7e5e0a958dacd7b0c0f8cccba1a03f7b8c07c480d08497f046a4e4510a45",
    "note": "Official GM fastener tightening specification tables, 30 pages. "
            "Machine-extracted; every row passed the N·m <-> lb-ft cross-check "
            "unless explicitly flagged on the record.",
}

# FSM section -> canonical assembly path.
SECTION_ASSEMBLY = {
    "Front Suspension": "Chassis > Front Suspension",
    "Rear Suspension": "Chassis > Rear Suspension",
    "Wheel Alignment": "Chassis > Wheel Alignment",
    "Electronic Suspension Control (ESC)": "Chassis > Electronic Suspension Control",
    "Tires and Wheels": "Chassis > Wheels and Tires",
    "Disc Brakes": "Chassis > Brakes > Disc Brakes",
    "Hydraulic Brakes": "Chassis > Brakes > Hydraulic Brakes",
    "Antilock Brake System": "Chassis > Brakes > Antilock Brake System",
    "Park Brake": "Chassis > Brakes > Park Brake",
    "Steering Wheel and Column": "Steering > Wheel and Column",
    "Power Steering System": "Steering > Power Steering System",
    "Wheel Drive Shafts": "Driveline > Wheel Drive Shafts",
    "Rear Drive Axle": "Driveline > Rear Drive Axle",
    "Propeller Shaft": "Driveline > Propeller Shaft",
    "Clutch": "Driveline > Clutch",
    "Manual Transmission - MM6/M12": "Driveline > Manual Transmission",
    "Automatic Transmission - 4L60-E/4L65-E": "Driveline > Automatic Transmission",
    "Engine Mechanical - 5.7L": "Engine > Engine Mechanical",
    "Engine Cooling": "Engine > Cooling",
    "Engine Electrical": "Engine > Electrical",
    "Engine Exhaust": "Engine > Exhaust",
    "Engine Controls - 5.7L": "Engine > Engine Controls",
    "Body Front End": "Body > Front End",
    "Body Rear End": "Body > Rear End",
    "Bumpers": "Body > Bumpers",
    "Doors": "Body > Doors",
    "Roof": "Body > Roof",
    "Stationary Windows": "Body > Stationary Windows",
    "Frame and Underbody": "Body > Frame and Underbody",
    "Collision Repair": "Body > Collision Repair",
    "Interior Trim": "Interior > Trim",
    "Instrument Panel, Gages, and Console": "Interior > Instrument Panel",
    "Seats": "Interior > Seats",
    "Seat Belts": "Interior > Seat Belts",
    "SIR (Air Bag)": "Interior > SIR (Air Bag)",
    "Entertainment": "Interior > Entertainment",
    "HVAC Systems - Automatic": "HVAC > Automatic HVAC",
    "Heating, Ventilation and Air Conditioning": "HVAC > Heating and A/C",
    "Lighting Systems": "Electrical > Lighting",
    "Horns": "Electrical > Horns",
    "Wipers/Washer Systems": "Electrical > Wipers and Washers",
    "Cruise Control": "Electrical > Cruise Control",
    "Data Link Communications": "Electrical > Data Link Communications",
}

# Name-based reassignment. The FSM lists e.g. "Rear Stabilizer Shaft Bracket
# Bolt" inside the Engine Exhaust section because you remove it during that
# procedure. The fastener's HOME is the suspension, and that is where a user
# will look for it and expect its neighbours.
NAME_ASSEMBLY = [
    (r"\brear stabilizer shaft\b", "Chassis > Rear Suspension"),
    (r"\bstabilizer shaft\b", "Chassis > Front Suspension"),
    (r"\brear (shock absorber|spring|control arm|knuckle|wheel)\b", "Chassis > Rear Suspension"),
    (r"\bfront (shock absorber|spring|control arm|knuckle|wheel hub)\b", "Chassis > Front Suspension"),
    # "Steering Wheel Nut" is not a road-wheel fastener. Without the exclusion
    # it was filed under Wheels and Tires, which then put "wheel" but not
    # "steering" in its indexed text and let the lug-nut record win the query
    # "steering wheel nut" — a wrong answer on a fastener nobody wants
    # confused with lug nuts.
    (r"(?<!steering )\bwheel nuts?\b", "Chassis > Wheels and Tires"),
    (r"\bbrake caliper\b", "Chassis > Brakes > Disc Brakes"),
    (r"\bspark plug\b", "Engine > Engine Mechanical"),
    (r"\bseat belt\b", "Interior > Seat Belts"),
]

POS_PATTERNS = {
    "vertical": [(r"\b(upper|top)\b", "upper"), (r"\b(lower|bottom)\b", "lower")],
    "longitude": [(r"\bfront\b", "front"), (r"\brear\b", "rear")],
    "lateral": [(r"\b(left|lh|driver)\b", "LH"), (r"\b(right|rh|passenger)\b", "RH")],
    "radial": [(r"\b(inner|inboard)\b", "inboard"), (r"\b(outer|outboard)\b", "outboard")],
}

SINGLE_USE_RE = re.compile(r"use new|install a new|new bolt|new nut", re.IGNORECASE)
SEQUENCE_RE = re.compile(r"in sequence", re.IGNORECASE)
STAGE_ORDER = {"installation pass": 0, "first pass": 1, "initial pass": 1,
               "second pass": 2, "third pass": 3, "fourth pass": 4, "final pass": 9}


OVERLAY = ROOT / "ingest" / "overlays" / "c5-2003-overlay.json"

LBFT_PER_NM = 0.7375621
LBIN_PER_NM = 8.850746


def _fmt(value: float) -> str:
    """One decimal below 10, whole numbers above — matching how a torque wrench
    is actually readable. 8.8 lb ft is meaningful; 1234.6 lb in is not."""
    if value < 10:
        return f"{value:.1f}".rstrip("0").rstrip(".")
    return f"{value:.0f}"


def derive_unit(metric_text: str, want: str) -> str | None:
    """Convert the source's N·m value into the English unit it did NOT print.

    The FSM gives N·m plus exactly ONE of lb ft / lb in per row, so a third
    column can only ever be computed. This is the one derived number in the
    system, and it exists because 376 of 708 rows are printed in lb-in only —
    which is unreadable if your wrench is in lb-ft.

    Three rules keep it honest:
      * it is computed at INGEST and stored as a typed field, so the output
        guard still sees it as part of the record rather than as a number that
        appeared from nowhere at render time;
      * it is derived from the N·m value, which is the source's primary and is
        present on every row (and is correct even on the six rows whose English
        unit LABEL is wrong — see docs/10);
      * the UI marks it with '≈' so a printed value and a converted one are
        never confusable.
    """
    factor = LBFT_PER_NM if want == "lb ft" else LBIN_PER_NM
    parts = [p.strip() for p in re.split(r"[-–]", metric_text) if p.strip()]
    try:
        vals = [float(p) for p in parts]
    except ValueError:
        return None
    if not vals:
        return None
    return "-".join(_fmt(v * factor) for v in vals)


def slug(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", s.lower())).strip("-")


def _matches(f: dict, entry: dict) -> bool:
    if entry["matchName"].lower() != f["name"].lower():
        return False
    want = entry.get("matchAssembly")
    return not want or want == f["assembly"]


def apply_overlay(fasteners: list[dict], overlay: dict) -> dict:
    """Merge researched bulletins and corroborations onto the FSM rows.

    A supersession REPLACES the stages shown, because the FSM value is stale
    and serving it would be the most dangerous failure the system can have —
    it looks fully trustworthy by every other signal. The old value is kept on
    the record so the UI can show what changed.

    Corroboration from 2+ independent sources promotes tier B to tier A.
    """
    counts = {"superseded": 0, "corroborated": 0, "promoted": 0, "singleUse": 0}

    for entry in overlay.get("supersessions", []):
        for f in fasteners:
            if not _matches(f, entry):
                continue
            old = " → ".join(
                s["primary"] + (f" ({s['secondary']})" if s["secondary"] else "")
                for s in f["stages"])
            new_stages = []
            for i, s in enumerate(entry["newStages"], 1):
                sec = s.get("secondary")
                deriv = None
                if s["kind"] == "torque" and sec:
                    want = "lb in" if "ft" in sec else "lb ft"
                    metric = re.sub(r"[^0-9.\-]", "", s["primary"])
                    dv = derive_unit(metric, want)
                    if dv and want == "lb in" and max(float(x) for x in dv.split("-")) > 400:
                        dv = None
                    if dv:
                        deriv = {"value": dv, "unit": want}
                new_stages.append({
                    "no": i, "label": s.get("label", ""), "kind": s["kind"],
                    "primary": s["primary"], "secondary": sec,
                    "angle": s.get("angle"), "detail": s.get("detail", ""),
                    "derived": deriv,
                })
            f["supersedes"] = {
                "oldStages": f["stages"],
                "oldValue": old,
                "oldSource": "2003 Corvette Fastener Tightening Specifications",
                "bulletin": entry["bulletinSourceId"],
                "note": entry.get("note", ""),
            }
            f["stages"] = new_stages
            f["multiStage"] = len(new_stages) > 1
            f["provenance"]["tier"] = "A"
            f["provenance"]["status"] = "human_verified"
            f["provenance"]["sourceIds"] = [entry["bulletinSourceId"]] + f["provenance"]["sourceIds"]
            if any(s["kind"] == "angle" for s in new_stages) and not any(
                    w["kind"] == "torque_angle" for w in f["warnings"]):
                f["warnings"].append({
                    "kind": "torque_angle",
                    "text": "Torque-plus-angle fastener. An angle gauge is required; a "
                            "torque wrench alone cannot complete this correctly.",
                })
            counts["superseded"] += 1

    for entry in overlay.get("corroborations", []):
        for f in fasteners:
            if not _matches(f, entry):
                continue
            f.setdefault("corroboration", []).append({
                "sourceId": entry["sourceId"], "value": entry["value"],
                "agrees": entry.get("agrees", True), "note": entry.get("note", ""),
            })
            counts["corroborated"] += 1

    for entry in overlay.get("disagreements", []):
        for f in fasteners:
            if not _matches(f, entry):
                continue
            f.setdefault("corroboration", []).append({
                "sourceId": entry["otherSourceId"], "value": entry["otherValue"],
                "agrees": False, "note": entry.get("assessment", ""),
            })

    unmatched: list[str] = []
    for entry in overlay.get("aliases", []):
        hit = False
        for f in fasteners:
            if entry["matchName"].lower() != f["name"].lower():
                continue
            hit = True
            f.setdefault("aliases", [])
            for t in entry["terms"]:
                if t not in f["aliases"]:
                    f["aliases"].append(t)
                    counts["aliases"] = counts.get("aliases", 0) + 1
        if not hit:
            unmatched.append(entry["matchName"])
    if unmatched:
        counts["aliasesUNMATCHED"] = len(unmatched)
        print("  WARNING: alias entries matched no fastener:")
        for n in unmatched:
            print(f"    - {n}")

    for entry in overlay.get("singleUse", []):
        for f in fasteners:
            if entry["matchName"].lower() not in f["name"].lower():
                continue
            if not any(w["kind"] == "single_use" for w in f["warnings"]):
                f["warnings"].insert(0, {
                    "kind": "single_use",
                    "text": entry["reason"] + " Install new hardware.",
                })
                counts["singleUse"] += 1

    # Tier promotion: FSM (tier B) plus 2+ independent agreeing sources -> A.
    for f in fasteners:
        agreeing = [c for c in f.get("corroboration", []) if c["agrees"]]
        if f["provenance"]["tier"] == "B" and len(agreeing) >= 2 and not f["conflict"]:
            f["provenance"]["tier"] = "A"
            f["provenance"]["status"] = "dual_verified"
            counts["promoted"] += 1

    return counts


PASS_SPLIT_RE = re.compile(
    r"\s*-\s*(?:installation|first|second|third|fourth|final|initial)\s+pass\b",
    re.IGNORECASE)
# Parenthetical stage label: 'Water Pump Bolt (First Pass)'. Without this the
# first and final passes become two unrelated fasteners sharing a name, which
# then tie in the ranking and force a needless abstain.
PAREN_PASS_RE = re.compile(
    r"\s*\((?P<label>(?:installation|first|second|third|fourth|final|initial)\s+pass)\)\s*",
    re.IGNORECASE)


def full_name(row: dict) -> tuple[str, str]:
    """Split a row name into (fastener name, stage qualifier).

    'Cylinder Head Bolts - Final Pass all M11 Bolts in Sequence - Excluding the
    Medium Length Bolts...' -> ('Cylinder Head Bolts', 'all M11 Bolts in
    Sequence - Excluding the Medium Length Bolts...')

    The qualifier matters: the same stage label can appear twice with different
    qualifiers because it applies to different bolts in the same pattern. Losing
    it turns a legitimate pair of specs into a phantom conflict.
    """
    if row["parent"]:
        return PAREN_PASS_RE.sub("", row["parent"]).strip(), row["name"]
    if PAREN_PASS_RE.search(row["name"]):
        return PAREN_PASS_RE.sub("", row["name"]).strip(), ""
    parts = PASS_SPLIT_RE.split(row["name"], maxsplit=1)
    name = parts[0].strip(" -.")
    qualifier = parts[1].strip(" -.") if len(parts) > 1 else ""
    return (name or row["name"]), qualifier


# A name often repeats a position word that the assembly already carries
# ('Rear Shock Absorber Lower Mounting Bolt' inside Rear Suspension). Dropping
# the redundant prefix merges records the FSM names two ways into one fastener.
REDUNDANT_PREFIX_RE = re.compile(r"^(front|rear)\s+", re.IGNORECASE)


def canonical_name(name: str, assembly: str) -> str:
    # The FSM marks footnoted rows with a trailing digit ('...Bolts1'), which
    # is typography, not part of the fastener's name.
    name = re.sub(r"(?<=[a-z])\d$", "", name).strip()
    m = REDUNDANT_PREFIX_RE.match(name)
    if m and m.group(1).lower() in assembly.lower():
        return name[m.end():].strip()
    return name


def merge_cross_section_duplicates(groups: dict[str, dict]) -> dict[str, dict]:
    """Collapse records that are the same fastener listed in several sections.

    The FSM repeats a spec in every procedure section whose work touches it —
    'Negative Battery Cable Bolt' appears in ten. Those are one fastener, and
    leaving them as ten records both clutters the candidate list and causes
    false abstains, because ten identical candidates have zero score margin
    between them.

    Merge only when name, position AND every value agree. Differing values
    mean they are genuinely different fasteners (or a real conflict), and
    those are left alone.
    """
    buckets: dict[str, list[dict]] = {}
    for g in groups.values():
        vals = sorted(
            f"{s['label']}|{s['qualifier']}|{s['primary']}|{s['secondary']}"
            for s in g["stages"])
        key = "||".join([g["name"].lower(),
                         str(sorted((k, v) for k, v in g["position"].items() if v)),
                         *vals])
        buckets.setdefault(key, []).append(g)

    merged: dict[str, dict] = {}
    for members in buckets.values():
        if len(members) == 1:
            merged[members[0]["id"]] = members[0]
            continue
        # Home assembly = the one whose section list is longest, so a fastener
        # lands where the manual talks about it most; alphabetical tie-break
        # keeps the build deterministic.
        home = sorted(members, key=lambda g: (-len(g["sections"]), g["assembly"]))[0]
        for other in members:
            if other is home:
                continue
            for sec in other["sections"]:
                if sec not in home["sections"]:
                    home["sections"].append(sec)
            for pg in other["pages"]:
                if pg not in home["pages"]:
                    home["pages"].append(pg)
            for vb in other["verbatim"]:
                if vb not in home["verbatim"]:
                    home["verbatim"].append(vb)
            for a in other["assemblies_seen"]:
                if a not in home["assemblies_seen"]:
                    home["assemblies_seen"].append(a)
        merged[home["id"]] = home
    return merged


def stage_label(row: dict) -> str:
    if pm := PAREN_PASS_RE.search(row["name"]):
        return pm.group("label").title()
    if row["stage_label"]:
        return row["stage_label"]
    m = re.search(r"\b(installation|first|second|third|fourth|final|initial)\s+pass\b",
                  row["name"], re.IGNORECASE)
    return m.group(0).title() if m else ""


def positions(name: str, assembly: str) -> dict:
    """Position axes for the deterministic gate. Absence is NOT a contradiction,
    so leaving an axis null is always safe; asserting one wrongly is not."""
    out = {k: None for k in POS_PATTERNS}
    # Assembly path first (weaker), then the name (stronger) overrides.
    for text in (assembly, name):
        low = text.lower()
        for axis, pats in POS_PATTERNS.items():
            for pat, val in pats:
                if re.search(pat, low):
                    out[axis] = val
    return out


def assembly_for(name: str, section: str) -> str:
    low = name.lower()
    for pat, path in NAME_ASSEMBLY:
        if re.search(pat, low):
            return path
    return SECTION_ASSEMBLY.get(section, f"Other > {section}" if section else "Other")


def main() -> None:
    parsed = json.loads(PARSED.read_text(encoding="utf-8"))
    rows = parsed["rows"]

    # ---- group rows into fasteners -------------------------------------
    groups: dict[str, dict] = {}
    for row in rows:
        name, qualifier = full_name(row)
        assembly = assembly_for(name, row["section"])
        name = canonical_name(name, assembly)
        pos = positions(name, assembly)
        # Identity includes position + assembly: 'Upper Control Arm Ball Joint
        # Stud Nut' exists at BOTH ends of the car with different specs. Those
        # are two fasteners, not a conflict.
        gid = slug(f"{assembly}-{name}-{pos['longitude'] or ''}-{pos['vertical'] or ''}")
        g = groups.setdefault(gid, {
            "id": f"{VEHICLE['id']}/{gid}",
            "name": name,
            "assembly": assembly,
            "position": pos,
            "stages": [],
            "sections": [],
            "pages": [],
            "verbatim": [],
            "assemblies_seen": [assembly],
            "flags": [],
        })
        label = stage_label(row)
        if row["kind"] == "torque":
            primary = f"{row['metric_text']} {row['metric_unit']}"
        elif row["kind"] == "angle":
            primary = f"+{row['angle_degrees']}°"
        else:
            primary = row["turns_text"]
        # The English unit the source did NOT print, computed once here.
        derived = None
        if row["kind"] == "torque" and row["english_unit"]:
            want = "lb in" if "ft" in row["english_unit"] else "lb ft"
            dv = derive_unit(row["metric_text"], want)
            # A lug nut converts to ~1239 lb in, which no inch-pound wrench can
            # deliver and no one wants to read. Inch-pound tools top out around
            # 300 lb in, so above that the conversion is noise rather than help.
            if dv and want == "lb in" and max(float(x) for x in dv.split("-")) > 400:
                dv = None
            if dv:
                derived = {"value": dv, "unit": want}

        stage = {
            "label": label,
            "kind": row["kind"],
            "primary": primary,
            "derived": derived,
            "secondary": f"{row['english_text']} {row['english_unit']}" if row["kind"] == "torque" else None,
            "angle": row["angle_degrees"],
            "qualifier": qualifier,
            "order": STAGE_ORDER.get(label.lower(), 1),
            "xcheck": row["xcheck"],
            "xcheckDetail": row["xcheck_detail"],
            "verbatim": row["verbatim"],
            "detail": qualifier,
        }
        g["stages"].append(stage)
        if row["section"] and row["section"] not in g["sections"]:
            g["sections"].append(row["section"])
        if row["page"] not in g["pages"]:
            g["pages"].append(row["page"])
        g["verbatim"].append(row["verbatim"])

    groups = merge_cross_section_duplicates(groups)

    # ---- normalise, flag, and emit -------------------------------------
    fasteners = []
    conflicts = 0
    for g in groups.values():
        # Dedup identical stages that came from repeated sections (free
        # corroboration), keeping distinct values as potential conflicts.
        seen: dict[str, dict] = {}
        for s in g["stages"]:
            k = f"{s['label']}|{s['qualifier']}|{s['primary']}|{s['secondary']}"
            seen.setdefault(k, s)
        stages = sorted(seen.values(), key=lambda s: (s["order"], s["primary"]))

        # Conflict = two stages with the SAME label but different values.
        by_label: dict[str, set] = {}
        for s in stages:
            # Key on label AND qualifier: 'Final Pass' legitimately appears
            # twice for cylinder head bolts, applying to different bolts.
            by_label.setdefault(f"{s['label']} {s['qualifier']}".strip(),
                                set()).add(f"{s['primary']} / {s['secondary']}")
        conflicting = {k: sorted(v) for k, v in by_label.items() if len(v) > 1}

        for i, s in enumerate(stages, 1):
            s["no"] = i

        blob = " ".join(g["verbatim"])
        warnings = []
        if SINGLE_USE_RE.search(blob):
            warnings.append({
                "kind": "single_use",
                "text": "Source specifies new hardware for this fastener — do not reuse.",
            })
        if any(s["kind"] == "angle" for s in stages):
            warnings.append({
                "kind": "torque_angle",
                "text": "Torque-plus-angle fastener. An angle gauge is required; a torque "
                        "wrench alone cannot complete this correctly.",
            })
        sequence = "Tighten in the sequence given by the service manual." if SEQUENCE_RE.search(blob) else ""

        defects = [s for s in stages if s["xcheck"] in ("unit_label_defect", "mismatch")]

        status = "machine_extracted"
        if conflicting:
            status = "conflicting"

        f = {
            "id": g["id"],
            "name": g["name"],
            "assembly": g["assembly"],
            "position": g["position"],
            "stages": [{k: v for k, v in s.items()
                        if k in ("no", "label", "kind", "primary", "secondary",
                                 "angle", "detail", "derived")}
                       for s in stages],
            "multiStage": len(stages) > 1,
            "sequenceNote": sequence,
            "warnings": warnings,
            "provenance": {
                "tier": SOURCE_FSM["tier"],
                "status": status,
                "sourceIds": [SOURCE_FSM["id"]],
                "locators": [f"{s}, p.{p}" for s in g["sections"] for p in g["pages"][:1]],
                "sections": g["sections"],
                "pages": sorted(g["pages"]),
                "verbatim": g["verbatim"][0],
                "allVerbatim": g["verbatim"],
                "corroboratingSections": len(g["sections"]),
                "alsoListedUnder": [a for a in g["assemblies_seen"] if a != g["assembly"]],
            },
            "conflict": ({"byStage": conflicting,
                          "reason": "The source document lists different values for this "
                                    "fastener in different sections."} if conflicting else None),
            "sourceDefects": [{"stage": s["no"], "detail": s["xcheckDetail"],
                               "kind": s["xcheck"]} for s in defects],
        }
        if conflicting:
            conflicts += 1
        fasteners.append(f)

    overlay = json.loads(OVERLAY.read_text(encoding="utf-8")) if OVERLAY.exists() else {}
    overlay_counts = apply_overlay(fasteners, overlay)

    # assembly tree
    paths = sorted({f["assembly"] for f in fasteners})
    assemblies = []
    seen_paths = set()
    for p in paths:
        parts = p.split(" > ")
        for i in range(len(parts)):
            sub = " > ".join(parts[: i + 1])
            if sub in seen_paths:
                continue
            seen_paths.add(sub)
            assemblies.append({
                "id": slug(sub),
                "name": parts[i],
                "path": sub,
                "parentId": slug(" > ".join(parts[:i])) if i else None,
            })

    fasteners.sort(key=lambda f: (f["assembly"], f["name"]))
    data = {
        "vehicle": VEHICLE,
        "sources": [SOURCE_FSM] + overlay.get("sources", []),
        "notIngested": overlay.get("notIngested", []),
        "assemblies": assemblies,
        "fasteners": fasteners,
        "stats": {
            "fasteners": len(fasteners),
            "assemblies": len(assemblies),
            "conflicts": conflicts,
            "multiStage": sum(1 for f in fasteners if f["multiStage"]),
            "sourceDefects": sum(1 for f in fasteners if f["sourceDefects"]),
            "withWarnings": sum(1 for f in fasteners if f["warnings"]),
            "tierA": sum(1 for f in fasteners if f["provenance"]["tier"] == "A"),
            "tierB": sum(1 for f in fasteners if f["provenance"]["tier"] == "B"),
            "superseded": sum(1 for f in fasteners if f.get("supersedes")),
            "corroborated": sum(1 for f in fasteners if f.get("corroboration")),
        },
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")

    print(f"wrote {OUT.relative_to(ROOT)}")
    for k, v in data["stats"].items():
        print(f"  {k:>16}: {v}")
    print("  overlay applied:", overlay_counts)
    print("\n  assemblies with most fasteners:")
    cnt: dict[str, int] = {}
    for f in fasteners:
        cnt[f["assembly"]] = cnt.get(f["assembly"], 0) + 1
    for a, n in sorted(cnt.items(), key=lambda kv: -kv[1])[:14]:
        print(f"    {n:>4}  {a}")


if __name__ == "__main__":
    main()
