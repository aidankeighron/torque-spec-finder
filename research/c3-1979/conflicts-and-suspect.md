# C3 1979 — Conflicts and Suspect Values

**This is the safety-critical file.** Read it before ingesting anything.

---

## Part 1 — MUST NOT BE INGESTED

Values found and deliberately excluded. Each is listed so a future pass doesn't rediscover and
trust them.

| Value | Source | Why excluded |
|---|---|---|
| Oil pan 5/16" bolts **"165 ft-lbs"** | 1979 reproduction shop manual, via CF 4983549 | **Physically impossible.** A 5/16 Grade 5 bolt's *maximum safe* torque is ~30 lb-ft; 165 lb-ft shears it or tears the block. The 1978 manual's 265 **lb-in** confirms the units are the typo. |
| Lug nuts **95–120 lb-ft** | "AIM §10B p.427", via CF 2625688 | 1.5× every other source for a 7/16-20 wheel stud, above the 75–90 cluster, and above what the factory lug wrench can deliver. Possibly an assembly-line power-tool setting, not a service spec. |
| Crankshaft balancer **24 lb-ft** *(this appeared in the C5 research but the failure mode is identical)* | My Pro Street | Off by ~10×. Would let the balancer walk off. |
| "Harmonic balancer 1/2-20 — **85 lb-ft**" | small-block-chevy.com | SBC balancer bolt is **7/16-20 @ 60 lb-ft**. 85 lb-ft and 1/2-20 are **big-block** figures. Wrong bolt and over-torque. |
| "Connecting rod 3/8-24 — **30–35 lb-ft**" | 348-409.com | 30–35 is the **11/32"** rod bolt figure everywhere else; 3/8" is 40–45. Row mix-up. **Under-torqued rod bolts are catastrophic.** |
| "Rod bolts 3/8-24 — **50 lb-ft**, frequently 55–60 required" | small-block-chevy.com | 25–35% above consensus. The page frames it as a stretch-based (0.006") figure for performance builds; applying it to stock 1979 rod bolts risks yielding them. |
| "Oil pan to crankcase **1/2-20**: 7 lb-ft" | CF 2009548 | No 1/2-20 fastener exists on an SBC oil pan. Almost certainly a typo for 1/4-20. |
| Water pump bolts "min **30** / max **20** lb-ft" | 348-409.com | **Minimum exceeds maximum** — corrupt table row. Other sources say 30; this row is unusable as printed. |
| "Main bearing (inner) 70 / (outer) 65 lb-ft" under heading **1/2-13** | small-block-chevy.com | SBC main caps are **7/16-14**. Values match consensus but the thread-size heading is wrong — do not use this page to select hardware. |
| CF 673047's unattributed list: "ball joint nut lower **20 lb-ft**", "wheel stud nuts 60", "shock lower bolt 10" | CF 673047 | 20 lb-ft on a 7/8" lower ball joint nut is implausible by ~4×. The whole list reads like a **C1 (1953-62)** table; the thread says it came "from the C2 forum". |
| Converter-to-flexplate **46 lb-ft** for TH350/400 | camaros.net, quoting Bowtie Overdrives | That sheet is for **2004R/700R4**. TH350 applicability is the poster's inference. The GM 1979 Corvette Manual figure (35 lb-ft) is cited and specific — use that. |
| Chilton 1977-84 table **main caps 80 lb-ft** | Chilton p.96 | PDF text extraction destroyed the column alignment. Head 65 / rod 45 / balancer 60 / flywheel 60 / intake 30 / exhaust 20 from the same row all corroborate elsewhere, but **80 for main caps exceeds every other source (70–75)** and the alignment is unverified. A `vetteworks.tripod.com` snippet would have corroborated it, but that domain is dead — and **two unverified readings are not a cross-verification.** |
| Chilton power steering "24 N·m (18 lb-ft)" / "10 N·m (7.5 lb-ft)" | Chilton p.261/281 | From an illustration captioned "engines with **serpentine drive belt**" — 1984+. A 1979 L48 is V-belt. |
| Fan clutch 90–120 lb-in / 20–27 lb-ft | CF 4549642 | Cited to **1961 and 1962 AIM** — C1, not C3. |
| Front wheel cylinder threaded anchor pin 65 lb-ft | Chilton p.271 | **Drum brake** hardware (1963-64 front drums). A 1979 has four-wheel discs. |
| Girlock caliper self-locking bolt 22–25 lb-ft | Chilton p.272 | Explicitly "On 1984 and later models". |
| Corvette Central suspension-mount figures (upper coilover nut 65, lower coilover bolt 90, Borgeson box bolts 30, tie rod nuts 36) | tech.corvettecentral.com | That build uses **aftermarket coilovers and a Borgeson box**. Not stock 1979 hardware. |
| Van Steel part-number rows (FS-37 130, FS-38K 55-60, FS-39K 85-90, SR-17K 100) | vansteel.com | **Part-number-keyed to Van Steel's own hardware**, not the OEM joint. FS-37's 130 lb-ft is ~2× the 70 lb-ft that a restoration book gives for the same location. Do not generalize. |
| Clutch master/slave 15–22 and 20–30 lb-ft; manual trans-to-bellhousing 40–50 | Chilton | Manual-transmission hardware, and the clutch hydraulics are 1984+. Subject car is **automatic**. |

---

## Part 2 — SUSPECT, needs the 1979 FSM to resolve

Not excluded outright, but must not be served as an answer in current form.

### Chilton "upper ball joint stud nut 80 lb-ft (1968-82)"  ⚠️ highest risk

Every other source puts the **upper** at 45–50 and the **lower** at 75–90. Chilton appears to
have **swapped upper and lower**, or that step is actually describing the lower joint.

Over-torquing an upper ball joint stud is a **wheel-separation failure mode**. Do not use 80 for
the upper without the factory page.

### Chilton "camber adjusting cam nut 15–22 lb-ft" (1979-and-earlier, p.227)

This fastener sets rear camber and reacts cornering loads. 15–22 lb-ft is far below the 55–77
Chilton itself gives elsewhere for the same joint (pp.249, 251) and the 130 the 1980 GM manual
gives. Chilton may have conflated the strut-rod **bracket** bolts with the **cam nut**.

Report both; trust neither without the factory page.

### "Carrier cover to frame 95 lb-ft" (1980 GM Shop Manual via CF 753043)

95 lb-ft is far above every other differential-mounting figure found (50–65 range). Could be a
genuine high-clamp structural joint, or a transcription error. Needs the actual manual page.

### Front caliper housing/bridge bolts: 130 vs 60–80  ⚠️ highest risk

| Value | Source | Weight |
|---|---|---|
| **130 lb-ft** | GM Service Bulletin **74-T-41** (Aug 1974, covers 1965-1978) and the 1982 service manual | two GM documents |
| **80–110 N·m ≈ 60–80 lb-ft** | **1979 assembly manual** | the actual model year |

The 1979 AIM is the *right year* and disagrees by roughly 2×. A forum participant separately
reported finding 135 lb-ft on a car and being told it was wrong for 7/16" bolts (CF 3795091).

A forum caution worth preserving verbatim: *"The GM manual shows the front bolt torque for the
halves. 130 ft/lb — if you torque the rear half bolts to that you will twist and distort the
bolt."*

**Needs the 1979 FSM brake section before either value is entered as authoritative.**

---

## Part 3 — DISAGREEMENTS to model as `conflicting`

These are legitimate multi-source disagreements. The schema already supports this: store every
value with its source, flag `conflicting`, and let the UI show them side by side without picking.

| Fastener | Values found |
|---|---|
| **Lug nuts** | 75 (Chilton, Van Steel steel) · 80 steel / 90 aluminum (1979 SM) · 80 + 100-mile retorque (Van Steel alum) · 75–80 (two Chevrolet shop manuals) |
| **Upper ball joint stud nut** | 45 (Van Steel, ChevyDIY, forum) · 50 (Corvette Central, Vette Registry) · 80 (Chilton — suspect) |
| **Lower ball joint stud nut** | 75 (Van Steel, ChevyDIY) · 80 (Corvette Central, Vette Registry) · 90 (Chilton knuckle step) |
| **Service ball-joint mounting bolts** | 25 (Van Steel) · 50 (Chilton 1968-82) |
| **Lower control arm cross-shaft bolts** | 70 (Van Steel, ChevyDIY) · 65–75 (AIM) · 45–55 (Chilton — *and Chilton says torque at curb height*) |
| **Upper control arm cross-shaft bolts** | 35 (Van Steel) · 35–40 (Chilton) · 45–55 (AIM) · 60 (forum) |
| **Front caliper bracket / upper backing plate** | 70 (ChevyDIY, 11/16-16 × 7/8") · 90 (Corvette Central) · 130 (Van Steel FS-37) — ⚠️ these may be **three different fasteners** sharing a vague name. Do not merge. |
| **Rear camber cam / strut-rod inner cam nut** | 15–22 (Chilton p.227) · 55–77 (Chilton pp.249/251) · 70 (Van Steel) · 100 (Van Steel SR-17K) · 130 (1980 GM SM, Chilton 1980-82). **≈9× spread.** |
| **Strut rod bracket to carrier** | 15–22 (Chilton) · 30 (1980 GM SM) · 30–40 (forum) · 35 w/ Loctite (Van Steel) · 35–40 (Van Steel SR-13K) · 45 (Corvette Central, forum) |
| **Rear shock lower nut** | 40 (Van Steel) · 50–60 (Chilton, twice) · 60 (Corvette Central) · 70–80 (forum) |
| **Differential rear cover bolts** | **20** crosswise (Chilton) · 50 (Van Steel, CAC) · 65 (Corvette Central) |
| **Rear spring to carrier / spring retainer** | 45 (1980 GM SM) · 55–75 (Chilton + forum) · 65 center bolt (Corvette Central) · 70 (Van Steel). Plus a direct warning that 55–65 **bends the spring plate**, with a recommendation of 45 with suspension loaded. |
| **Pinion nut** | 200–220 lb-ft absolute (1980 GM SM) vs **rotating preload** 20–30 lb-in new / 5–15 lb-in used (1973 Overhaul Manual) vs 14–19 lb-in (Yukon). **Irreconcilable — preload governs.** |
| **Pitman shaft nut** | 140 · 150 (practice) · 160–210 · 185 (GM 1974-76) |
| **Idler arm** | to frame 30 · 35 · 35–40; to relay rod 35 · 50 |
| **Steering box to frame** | 30 (ChevyDIY) · 35–40 (Van Steel) · 70 (forum, Jim Shea) |
| **Front sway bar frame/bracket** | 20 (Van Steel) · **126 lb-in ≈ 10.5 lb-ft** (1979 SM) · 30 (ChevyDIY) |
| **Rear sway bar frame mount** | 15–20 (AIM, weak) · 30 (Van Steel blog, uncited) |
| **Body mounts** | 40–50 (1975 AIM) · 45 (ChevyDIY body) · 60 (ChevyDIY suspension chapter — same book, different chapter) |
| **SBC main bearing caps** | 70 (Summit, AJK) · 75 (1969 Overhaul Manual, RacingJunk) · 60–70 (348-409) · 80 (Chilton — suspect) |
| **SBC connecting rod bolts** | 40–45 (Summit) · 45 (AJK) · 30–35 (348-409 — suspect) · 50 (small-block-chevy — suspect) · 35 (RacingJunk) |
| **Valve cover** | 20–25 lb-in (348-409) · 25 lb-in (small-block-chevy) · 36 lb-in (AJK) · 48 lb-in (forum) · **55 lb-in (1970 chassis SM)** |
| **Flexplate to crankshaft** | 60 w/ thread locker (AJK, small-block-chevy) · 65 (Summit) · 60–65 (forum quoting manual) |
| **Exhaust manifold** | 25 (Summit, AJK, small-block-chevy) · 20 (forum) · 20–25 (RacingJunk) · center 25–30 / ends 15–20 (348-409) |
| **Intake manifold** | 30 (Summit, AJK, forum) · 25 (small-block-chevy) · 25–35 (348-409) |
| **Thermostat housing / water outlet** | 25 (AJK, forum) · 20 (small-block-chevy) · 25–35 (348-409) |
| **Oil pan drain plug** | 25–30 (348-409) · 25 (AJK) · 20 (small-block-chevy, forum) |
| **Oil pump bolt** | 60–70 (Summit, AJK) · 65 (small-block-chevy, forum) vs **45–50 for "oil pump to rear bearing cap bolt"** (348-409 *and* AJK — the same AJK page lists both) |
| **Engine mount to block** | 22–30 (1971 AIM) · 30 (ChevyDIY) · 36 (AJK) |
| **Engine mount through-bolt / to frame** | 25–35 (1971 AIM) · 35 to frame / 45–60 through-bolt (AJK) |
| **Spark plugs** | 25 (348-409, small-block-chevy 13/16 hex) · 22 (forum) · 20 (AJK) · **15 (1972 SM, tapered seat — the 1979 L48 uses tapered-seat R45TS)** |
| **Differential ring gear bolts** | 50 (1970 Chassis SM) · 45–60 (1980 GM SM) — compatible ranges |
| **Differential carrier bearing caps** | 55 (1970 Chassis SM) · 60–70 (1980 GM SM) |
| **Half shaft inner U-joint caps (bolt style)** | 30 (Van Steel, CAC) · 35 (forum) |
| **Half shaft outer flange bolts** | 70–90 (Chilton) · 75 (Van Steel, Corvette Mag, CAC) · 60–80 (forum) · 65 (forum, Corvette Central) |
| **Diff carrier front support** | 30 front / 45–55 side / 40–60 thru-bolt (Chilton) · 65 (1980 GM SM) · 65 to frame / 50+ to housing (Van Steel) · 50 (forum) |
| **Automatic transmission pan bolts** | 12–14 criss-cross w/ recheck (Chilton) · 7–8 lb-ft in 3 rounds (forum) |
| **Driveshaft U-joint** | 30 retainer/strap (1980 GM SM) · 12–16 "pinion D/S U-bolts" (forum) · 15 bearing strap (**1980+ only**). Possibly **different hardware styles**, not a true conflict. |
| **Front wheel bearing initial torque** | 12 lb-ft (Chilton, 1978 SM) · 15 lb-ft (Corvette Magazine, via forum) |

---

## Part 4 — The resolution path

None of Part 2 or Part 3 is resolvable by more web searching. More searching adds voices, not
authority — and because of the Van Steel echo problem it can actively create **false**
corroboration.

The single thing that resolves them is the **1979 GM Corvette Shop Manual**. ACDelco TDS does
not help (coverage starts 1998). A paper or PDF reprint from Helm / Zip / Mid America is the
path.

Until then the correct behaviour is exactly what the system already does: show every sourced
value with its origin, mark the record `conflicting`, and refuse to pick.
