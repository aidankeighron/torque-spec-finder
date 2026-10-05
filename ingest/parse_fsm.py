"""Parse the 2003 Corvette 'Fastener Tightening Specifications' FSM document.

Document structure (learned by inspection, not assumed):

    2003 Corvette Fastener Tightening Specifications   <- repeating page header
    Front Suspension                                   <- section name
    Application / Specification / Metric English       <- column header triple
    Crossmember Mounting Nuts ... 110 N·m 81 lb ft     <- simple row
    Lower Control Arm Ball Joint Stud Nut              <- multi-stage PARENT
    • First Pass  20 N·m 15 lb ft                      <-   stage 1
    • Final Pass  80 N·m 60 lb ft                      <-   stage 2
    Connecting Rod Bolts - Final Pass 75 degrees       <- angle-only stage

Several sections appear per page, and rows wrap across lines arbitrarily, so
the parser joins continuation lines until a buffer forms a complete record.

Rules this parser obeys (docs/04, docs/06):
  * Values are captured VERBATIM as printed. Nothing is re-derived or inferred.
  * Every row carries its page number and source line for provenance.
  * A buffer that never forms a valid record goes to a review bucket. Silent
    data loss is bad; silent data invention is fatal.
  * The N·m <-> lb ft/lb in cross-check runs on every row. Failures are
    classified, never auto-corrected.
"""

from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass, asdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "sources" / "c5-2003-fastener-specs.txt"
OUT = ROOT / "data" / "parsed" / "c5-2003-fsm-rows.json"

HEADER = "2003 Corvette Fastener Tightening Specifications"
COL_HEADERS = {"application", "specification", "metric english", "metric", "english"}

NM = r"N·m|N∙m|N-m|Nm"
NUM = r"\d+(?:\.\d+)?(?:\s*[-–]\s*\d+(?:\.\d+)?)?"

TORQUE_RE = re.compile(
    rf"^(?P<name>.*?)\s*(?P<metric>{NUM})\s*(?:{NM})\s+(?P<english>{NUM})\s*(?P<eunit>lb\s*ft|lb\s*in)\s*$",
    re.IGNORECASE)
ANGLE_RE = re.compile(r"^(?P<name>.*?)\s*(?P<deg>\d+)\s*(?:degrees?|°)\s*$", re.IGNORECASE)
# 'Second Pass  3 ½ flats' — a turn-count stage, not a torque and not an angle.
# NFKC turns '½' into '1⁄2' (U+2044 FRACTION SLASH), so the count class must
# accept it, and must be greedy or it captures only the fraction denominator.
FLATS_RE = re.compile(
    r"^(?P<name>.*?)\s*(?P<count>\d[\d\s½¼¾/⁄.]*)\s*(?P<unit>flats?|turns?|notch(?:es)?)\s*$",
    re.IGNORECASE)
BULLET_RE = re.compile(r"^\s*[•·▪]\s*")
PASS_RE = re.compile(r"\b(first|second|third|fourth|final|initial|installation)\s+pass\b", re.IGNORECASE)
# The FSM also writes stage labels parenthetically: 'Water Pump Bolt (First Pass)'.
PAREN_PASS_RE = re.compile(
    r"\s*\((?:installation|first|second|third|fourth|final|initial)\s+pass\)\s*",
    re.IGNORECASE)
FOOTNOTE_RE = re.compile(r"^\s*\d?[A-Z][a-z].{40,}$")

LBFT_PER_NM = 0.7375621
LBIN_PER_NM = 8.850746


@dataclass
class Row:
    section: str
    page: int
    name: str                 # verbatim fastener name from the source
    parent: str = ""          # multi-stage parent name, if this is a bullet stage
    stage_label: str = ""     # 'First Pass' / 'Final Pass' / ''
    kind: str = "torque"      # torque | angle
    metric_text: str = ""     # verbatim, e.g. "8.0-14.0"
    metric_unit: str = ""     # "N·m"
    english_text: str = ""    # verbatim, e.g. "6-10"
    english_unit: str = ""    # "lb ft" | "lb in"
    angle_degrees: int | None = None
    turns_text: str = ""     # verbatim turn-count stage, e.g. "3 ½ flats"
    verbatim: str = ""        # the joined source text this row came from
    xcheck: str = "ok"        # ok | range | na | unit_label_defect | mismatch
    xcheck_detail: str = ""


def norm(s: str) -> str:
    """Normalise unicode so the PDF's non-breaking hyphens and dot operators
    don't produce two spellings of the same fastener name."""
    s = unicodedata.normalize("NFKC", s)
    for a, b in (("‑", "-"), ("‐", "-"), ("–", "-"), ("—", "-"),
                 ("∙", "·"), ("", "•"), (" ", " ")):
        s = s.replace(a, b)
    return re.sub(r"[ \t]+", " ", s).strip()


def mid(text: str) -> float | None:
    """Midpoint of a printed range, or the value itself. Used ONLY for the
    cross-check — never for anything displayed."""
    parts = [p.strip() for p in re.split(r"[-–]", text) if p.strip()]
    try:
        vals = [float(p) for p in parts]
    except ValueError:
        return None
    return sum(vals) / len(vals) if vals else None


def cross_check(row: Row) -> None:
    """GM prints both units, so every row self-validates. See docs/06.
    This is the highest-value automatic check in the pipeline."""
    if row.kind != "torque":
        row.xcheck, row.xcheck_detail = "na", f"{row.kind} stage, no unit pair"
        return
    m, e = mid(row.metric_text), mid(row.english_text)
    if m is None or e is None:
        row.xcheck, row.xcheck_detail = "na", "unparseable numerics"
        return
    factor = LBFT_PER_NM if "ft" in row.english_unit else LBIN_PER_NM
    expect = m * factor
    # Tolerance absorbs the manual's own rounding (it prints whole numbers and
    # rounds lb-in coarsely). Tight enough to catch a wrong digit.
    if abs(expect - e) <= max(1.0, expect * 0.08):
        row.xcheck = "range" if "-" in row.metric_text else "ok"
        row.xcheck_detail = f"{m:g} N·m -> expect {expect:.1f}, printed {e:g} {row.english_unit}"
        return

    # Mismatch. Is it explained by a mislabelled unit?
    other = "lb ft" if "in" in row.english_unit else "lb in"
    exp_other = m * (LBFT_PER_NM if other == "lb ft" else LBIN_PER_NM)
    if abs(exp_other - e) <= max(1.0, exp_other * 0.08):
        row.xcheck = "unit_label_defect"
        row.xcheck_detail = (
            f"source prints '{row.english_text} {row.english_unit}' but {m:g} N·m = "
            f"{exp_other:.1f} {other}; printed unit label appears wrong, numeric "
            f"value corroborates '{other}'")
    else:
        row.xcheck = "mismatch"
        row.xcheck_detail = (
            f"{m:g} N·m -> expect {expect:.1f} {row.english_unit}, printed {e:g}; "
            f"no unit relabel explains this")


# A name must not begin with a unit or a bare value. When it does, the line
# joiner has glued one row's orphaned tail onto the next row's name — which
# happened on a four-line wrapped record and produced the fastener
# "N·m 17 lb in Driver Knee Bolster Trim Panel Lower Retaining Screws".
MISJOIN_RE = re.compile(rf"^\s*(?:{NM}|lb\s*ft|lb\s*in|\d)", re.IGNORECASE)


def _make(section: str, page: int, buf: str, parent: str) -> Row | None:
    """Turn a joined buffer into a Row, or return None if it isn't a record."""
    is_bullet = bool(BULLET_RE.match(buf))
    text = BULLET_RE.sub("", buf).strip()
    if MISJOIN_RE.match(text) and not is_bullet:
        return None

    if m := TORQUE_RE.match(text):
        name = m.group("name").strip(" .-")
        row = Row(section=section, page=page, kind="torque",
                  name=name or parent, parent=parent if is_bullet or not name else "",
                  metric_text=m.group("metric").replace(" ", ""), metric_unit="N·m",
                  english_text=m.group("english").replace(" ", ""),
                  english_unit=re.sub(r"\s+", " ", m.group("eunit").lower()),
                  verbatim=buf)
    elif m := ANGLE_RE.match(text):
        name = m.group("name").strip(" .-")
        row = Row(section=section, page=page, kind="angle",
                  name=name or parent, parent=parent if is_bullet or not name else "",
                  angle_degrees=int(m.group("deg")), verbatim=buf)
    elif m := FLATS_RE.match(text):
        # A turn-count stage ('3 ½ flats'). Captured verbatim as text because
        # there is no numeric torque to store and no safe way to convert one.
        name = m.group("name").strip(" .-")
        row = Row(section=section, page=page, kind="turns",
                  name=name or parent, parent=parent if is_bullet or not name else "",
                  turns_text=f"{norm(m.group('count'))} {m.group('unit').lower()}",
                  verbatim=buf)
    else:
        return None

    if pm := PASS_RE.search(text):
        row.stage_label = pm.group(0).title()
    cross_check(row)
    return row


def parse(text: str) -> tuple[list[Row], list[dict]]:
    # Flatten to (line, page), dropping repeating page headers.
    flat: list[tuple[str, int]] = []
    for chunk in text.split("===== PAGE ")[1:]:
        head, _, body = chunk.partition("=====")
        page = int(head.strip())
        for raw in body.split("\n"):
            line = norm(raw)
            if line and line != HEADER:
                flat.append((line, page))

    rows: list[Row] = []
    review: list[dict] = []
    section = ""
    parent = ""
    buf = ""
    buf_page = 0
    buf_lines = 0

    i = 0
    while i < len(flat):
        line, page = flat[i]
        low = line.lower().rstrip(" :")

        # Section name is the line immediately preceding the column-header
        # triple. Several sections appear per page, so this is the only
        # reliable delimiter.
        if low == "application" and i > 0:
            section = flat[i - 1][0]
            # the previous line was a heading, not data — retract it if buffered
            if buf.strip() == section:
                buf, buf_lines = "", 0
            parent = ""
            i += 1
            while i < len(flat) and flat[i][0].lower().rstrip(" :") in COL_HEADERS:
                i += 1
            continue
        if low in COL_HEADERS:
            i += 1
            continue

        # A bullet always starts a new record and belongs to the current parent.
        if BULLET_RE.match(line) and buf and not BULLET_RE.match(buf):
            if (r := _make(section, buf_page, buf, parent)) is not None:
                rows.append(r)
            else:
                # the unconsumed buffer was a bare multi-stage parent name
                parent = buf.strip()
            buf, buf_lines = "", 0
        if BULLET_RE.match(line) and not parent and rows:
            # Bullet with no bare-name parent: it continues the previous row's
            # fastener, whose own name carries the first stage label.
            parent = PAREN_PASS_RE.sub("", rows[-1].parent or rows[-1].name).strip()

        buf = f"{buf} {line}".strip() if buf else line
        buf_page = buf_page or page
        buf_lines += 1

        if (r := _make(section, buf_page, buf, parent)) is not None:
            rows.append(r)
            if not BULLET_RE.match(buf):
                parent = ""
            buf, buf_lines, buf_page = "", 0, 0
        elif buf_lines >= 5:
            # Never guess. Footnotes and prose go to review.
            review.append({"section": section, "page": buf_page, "line": buf})
            buf, buf_lines, buf_page = "", 0, 0
        i += 1

    if buf:
        review.append({"section": section, "page": buf_page, "line": buf})
    return rows, review


def main() -> None:
    rows, review = parse(SRC.read_text(encoding="utf-8"))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"rows": [asdict(r) for r in rows], "review": review},
                              indent=1, ensure_ascii=False), encoding="utf-8")

    by_sec: dict[str, int] = {}
    for r in rows:
        by_sec[r.section] = by_sec.get(r.section, 0) + 1
    buckets: dict[str, list[Row]] = {}
    for r in rows:
        buckets.setdefault(r.xcheck, []).append(r)

    print(f"rows parsed   : {len(rows)}")
    print(f"needs review  : {len(review)}")
    print(f"sections      : {len(by_sec)}")
    print(f"angle stages  : {sum(1 for r in rows if r.kind == 'angle')}")
    print(f"turn stages   : {sum(1 for r in rows if r.kind == 'turns')}")
    print(f"multi-stage   : {sum(1 for r in rows if r.stage_label)}")
    print("\ncross-check   : " + "  ".join(f"{k}={len(v)}" for k, v in sorted(buckets.items())))
    print()
    for s, n in sorted(by_sec.items(), key=lambda kv: -kv[1]):
        print(f"  {n:>4}  {s}")
    for key, label in (("unit_label_defect", "UNIT-LABEL DEFECTS IN SOURCE"),
                       ("mismatch", "UNRESOLVED MISMATCHES")):
        if g := buckets.get(key):
            print(f"\n{label} ({len(g)}):")
            for r in g:
                print(f"  p{r.page} [{r.section}] {r.name}")
                print(f"      {r.xcheck_detail}")


if __name__ == "__main__":
    main()
