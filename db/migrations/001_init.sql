-- 001_init.sql — Torque Spec Finder core schema
--
-- Design rationale lives in docs/03-data-model.md. The short version:
-- a torque spec is NOT (name, value). The columns below exist so that a
-- "correct number applied wrongly" cannot be represented.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Sources. Nothing enters this database without attribution.
-- ---------------------------------------------------------------------------

CREATE TABLE source (
    id            INTEGER PRIMARY KEY,
    kind          TEXT NOT NULL CHECK (kind IN ('fsm', 'tsb', 'secondary', 'community', 'generic_chart')),
    title         TEXT NOT NULL,
    publisher     TEXT,
    revision_date TEXT,                     -- ISO-8601; TSB supersession depends on this
    tier          TEXT NOT NULL CHECK (tier IN ('A', 'B', 'C', 'D', 'E')),
    file_path     TEXT,
    sha256        TEXT UNIQUE,              -- same document can't be ingested twice as "independent"
    ingested_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Vehicles. vehicle_config is the unit the UI selects and every query filters on.
-- ---------------------------------------------------------------------------

CREATE TABLE platform (
    id              INTEGER PRIMARY KEY,
    name            TEXT NOT NULL UNIQUE,   -- 'C5 Corvette'
    -- per-platform position synonyms, e.g. {"driver": "LH"} for US-market LHD.
    -- Stored, not hardcoded, because it is wrong for RHD markets.
    position_synonyms TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE vehicle_config (
    id          INTEGER PRIMARY KEY,
    platform_id INTEGER NOT NULL REFERENCES platform(id),
    year        INTEGER NOT NULL,
    model       TEXT NOT NULL,
    trim        TEXT,
    engine_rpo  TEXT,                       -- LS1, LS6
    trans_rpo   TEXT,                       -- MN6, M30
    drive       TEXT,
    notes       TEXT,
    UNIQUE (platform_id, year, model, trim, engine_rpo, trans_rpo)
);

-- RPO options that can change hardware (Z51, F45, ...). Kept separate from
-- vehicle_config because a car carries many of them.
CREATE TABLE vehicle_option (
    id                INTEGER PRIMARY KEY,
    vehicle_config_id INTEGER NOT NULL REFERENCES vehicle_config(id) ON DELETE CASCADE,
    rpo               TEXT NOT NULL,
    description       TEXT,
    UNIQUE (vehicle_config_id, rpo)
);

-- ---------------------------------------------------------------------------
-- Assemblies. This tree IS the "nearby bolts" feature — see docs/03.
-- ---------------------------------------------------------------------------

CREATE TABLE assembly (
    id          INTEGER PRIMARY KEY,
    platform_id INTEGER NOT NULL REFERENCES platform(id),
    parent_id   INTEGER REFERENCES assembly(id),
    name        TEXT NOT NULL,
    path        TEXT NOT NULL,              -- 'Chassis > Rear Suspension > Stabilizer Bar'
    aliases     TEXT NOT NULL DEFAULT '[]'  -- JSON array
);

CREATE INDEX idx_assembly_parent ON assembly(parent_id);

-- ---------------------------------------------------------------------------
-- Fasteners.
-- ---------------------------------------------------------------------------

CREATE TABLE fastener (
    id             INTEGER PRIMARY KEY,
    assembly_id    INTEGER NOT NULL REFERENCES assembly(id),
    canonical_name TEXT NOT NULL,           -- VERBATIM from source, never paraphrased

    -- Powers the deterministic position gate (docs/05). NULL means "unqualified",
    -- which is NOT the same as contradicting a query hint.
    position_vertical  TEXT CHECK (position_vertical  IN ('upper', 'lower')),
    position_longitude TEXT CHECK (position_longitude IN ('front', 'rear')),
    position_lateral   TEXT CHECK (position_lateral   IN ('LH', 'RH')),
    position_radial    TEXT CHECK (position_radial    IN ('inboard', 'outboard')),

    qty            INTEGER,
    thread_size    TEXT,                    -- 'M10x1.5'; also a plausibility-band input

    -- false => torque-to-yield / single use. Drives the do-not-reuse warning.
    reusable       INTEGER CHECK (reusable IN (0, 1)),

    notes          TEXT
);

CREATE INDEX idx_fastener_assembly ON fastener(assembly_id);

-- Learned slang. Every time the system abstains and you pick, your phrasing lands here.
CREATE TABLE alias (
    id          INTEGER PRIMARY KEY,
    fastener_id INTEGER NOT NULL REFERENCES fastener(id) ON DELETE CASCADE,
    text        TEXT NOT NULL,
    kind        TEXT NOT NULL CHECK (kind IN ('oem', 'slang', 'learned')),
    UNIQUE (fastener_id, text)
);

-- ---------------------------------------------------------------------------
-- The spec. One row per STAGE — multi-stage sequences are multiple rows.
-- ---------------------------------------------------------------------------

CREATE TABLE torque_spec (
    id          INTEGER PRIMARY KEY,
    fastener_id INTEGER NOT NULL REFERENCES fastener(id) ON DELETE CASCADE,
    source_id   INTEGER NOT NULL REFERENCES source(id),

    stage_no    INTEGER NOT NULL DEFAULT 1,
    stage_kind  TEXT NOT NULL DEFAULT 'torque'
                CHECK (stage_kind IN ('torque', 'angle', 'torque_then_angle', 'turn_back')),

    -- Stored EXACTLY as printed in the source. Never re-derived from each other.
    -- The N·m <-> lb-ft relation is an ingest VALIDATOR only (docs/06), never a
    -- way to compute a value we serve.
    value_primary     REAL,
    unit_primary      TEXT CHECK (unit_primary   IN ('N·m', 'lb ft', 'lb in')),
    value_secondary   REAL,
    unit_secondary    TEXT CHECK (unit_secondary IN ('N·m', 'lb ft', 'lb in')),
    angle_degrees     REAL,
    tolerance         TEXT,

    sequence_note TEXT,      -- 'in the sequence shown in fig 3'
    precondition  TEXT,      -- 'vehicle at curb height' — a right number applied wrong is wrong
    threadlocker  TEXT,

    provenance_tier TEXT NOT NULL CHECK (provenance_tier IN ('A', 'B', 'C', 'D', 'E')),
    verbatim_quote  TEXT NOT NULL,          -- the original sentence; makes answers auditable
    source_locator  TEXT,                   -- section / page / table / figure

    verification_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (verification_status IN ('pending', 'machine_extracted', 'dual_verified',
                                       'human_verified', 'conflicting', 'superseded')),

    superseded_by_id INTEGER REFERENCES torque_spec(id),   -- TSB supersession
    effective_from   TEXT,
    effective_to     TEXT,

    created_at TEXT NOT NULL DEFAULT (datetime('now')),

    -- An angle stage without an angle is not a spec.
    CHECK (stage_kind NOT IN ('angle', 'torque_then_angle') OR angle_degrees IS NOT NULL),
    -- A torque stage must carry a value.
    CHECK (stage_kind NOT IN ('torque', 'torque_then_angle') OR value_primary IS NOT NULL)
);

CREATE INDEX idx_spec_fastener ON torque_spec(fastener_id, stage_no);
CREATE INDEX idx_spec_status   ON torque_spec(verification_status);

-- ---------------------------------------------------------------------------
-- Applicability. Expanded at INGEST, never inferred at query time (docs/03).
-- ---------------------------------------------------------------------------

CREATE TABLE applicability (
    torque_spec_id    INTEGER NOT NULL REFERENCES torque_spec(id) ON DELETE CASCADE,
    vehicle_config_id INTEGER NOT NULL REFERENCES vehicle_config(id) ON DELETE CASCADE,
    PRIMARY KEY (torque_spec_id, vehicle_config_id)
);

CREATE INDEX idx_applicability_vehicle ON applicability(vehicle_config_id);

-- ---------------------------------------------------------------------------
-- Diagrams.
-- ---------------------------------------------------------------------------

CREATE TABLE figure (
    id          INTEGER PRIMARY KEY,
    assembly_id INTEGER NOT NULL REFERENCES assembly(id),
    source_id   INTEGER NOT NULL REFERENCES source(id),
    image_path  TEXT NOT NULL,
    caption     TEXT
);

CREATE TABLE callout (
    id          INTEGER PRIMARY KEY,
    figure_id   INTEGER NOT NULL REFERENCES figure(id) ON DELETE CASCADE,
    fastener_id INTEGER REFERENCES fastener(id) ON DELETE SET NULL,
    number      TEXT,
    bbox        TEXT                        -- JSON [x, y, w, h] normalised 0-1
);

-- ---------------------------------------------------------------------------
-- Search indexes. Same file, so the vehicle filter and the vector search
-- happen in ONE query — see docs/05 on why retrieve-then-filter loses answers.
--
-- indexed_text = canonical_name + aliases + assembly path + position + thread size.
-- The torque VALUE is never indexed or embedded.
-- ---------------------------------------------------------------------------

CREATE TABLE fastener_search (
    fastener_id  INTEGER PRIMARY KEY REFERENCES fastener(id) ON DELETE CASCADE,
    indexed_text TEXT NOT NULL
);

CREATE VIRTUAL TABLE fastener_fts USING fts5(
    indexed_text,
    content = 'fastener_search',
    content_rowid = 'fastener_id',
    tokenize = 'porter unicode61'
);

CREATE TRIGGER fastener_search_ai AFTER INSERT ON fastener_search BEGIN
    INSERT INTO fastener_fts(rowid, indexed_text) VALUES (new.fastener_id, new.indexed_text);
END;

CREATE TRIGGER fastener_search_ad AFTER DELETE ON fastener_search BEGIN
    INSERT INTO fastener_fts(fastener_fts, rowid, indexed_text)
    VALUES ('delete', old.fastener_id, old.indexed_text);
END;

CREATE TRIGGER fastener_search_au AFTER UPDATE ON fastener_search BEGIN
    INSERT INTO fastener_fts(fastener_fts, rowid, indexed_text)
    VALUES ('delete', old.fastener_id, old.indexed_text);
    INSERT INTO fastener_fts(rowid, indexed_text) VALUES (new.fastener_id, new.indexed_text);
END;

-- Vector index. Created by db/migrate.py once the sqlite-vec extension is loaded:
--
--   CREATE VIRTUAL TABLE fastener_vec USING vec0(
--       fastener_id INTEGER PRIMARY KEY,
--       embedding   float[384]          -- bge-small-en-v1.5
--   );

-- ---------------------------------------------------------------------------
-- Serving view. The API reads THIS, not torque_spec directly, so the
-- "only verified, non-superseded rows are servable" policy is enforced by the
-- database rather than remembered by each call site.
-- ---------------------------------------------------------------------------

CREATE VIEW servable_spec AS
SELECT ts.*
FROM torque_spec ts
WHERE ts.verification_status IN ('human_verified', 'dual_verified')
  AND ts.superseded_by_id IS NULL;

-- Conflicts: same fastener + vehicle + stage, differing values, none superseded.
-- Detected at ingest; this view is the report (docs/06).
CREATE VIEW spec_conflict AS
SELECT a.fastener_id,
       ap.vehicle_config_id,
       a.stage_no,
       a.id AS spec_a, b.id AS spec_b,
       a.value_primary AS value_a, b.value_primary AS value_b
FROM torque_spec a
JOIN torque_spec b
  ON a.fastener_id = b.fastener_id
 AND a.stage_no    = b.stage_no
 AND a.id < b.id
JOIN applicability ap ON ap.torque_spec_id = a.id
JOIN applicability bp ON bp.torque_spec_id = b.id
                     AND bp.vehicle_config_id = ap.vehicle_config_id
WHERE a.superseded_by_id IS NULL
  AND b.superseded_by_id IS NULL
  AND a.unit_primary = b.unit_primary
  AND abs(a.value_primary - b.value_primary) > 0.01;
