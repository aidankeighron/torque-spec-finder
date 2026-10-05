"use client";

import type { Fastener } from "@/lib/types";
import { locationView } from "@/lib/render/location";

/**
 * A plan view of the car with the fastener's region lit up.
 *
 * Drawn from above with the **nose pointing up**, which is the orientation
 * where the driver's side of the car appears on the left of the picture — the
 * one arrangement that doesn't require mentally rotating anything.
 *
 * Phase A of docs/11-location-and-diagrams.md. It is a region indicator, not a
 * callout: it narrows "which corner of the car" and deliberately stops there,
 * because that is exactly as far as the data supports. Anything more precise
 * needs a real diagram with a verified fastener-to-callout mapping.
 */
export function LocationView({ fastener }: { fastener: Fastener }) {
  const loc = locationView(fastener);

  // Plan-view geometry. Bands run nose (top) to tail (bottom).
  const BANDS = { front: 14, mid: 56, rear: 98 } as const;
  const BAND_H = 40;
  const SIDES = { LH: 12, RH: 62 } as const;
  const SIDE_W = 46;

  const lit = (band: keyof typeof BANDS, side: keyof typeof SIDES) =>
    loc.bands.includes(band) && loc.sides.includes(side);

  return (
    <div className="loc" data-testid="location-view">
      <svg
        className="loc-svg"
        viewBox="0 0 120 152"
        role="img"
        aria-label={`Location: ${loc.sentence}`}
      >
        {/* body outline */}
        <path
          d="M22 12 Q60 2 98 12 L106 64 Q108 104 100 140 Q60 148 20 140 Q12 104 14 64 Z"
          className="loc-body"
        />

        {/* lit zones, drawn under the outline strokes */}
        {(Object.keys(BANDS) as Array<keyof typeof BANDS>).flatMap((band) =>
          (Object.keys(SIDES) as Array<keyof typeof SIDES>).map((side) =>
            lit(band, side) ? (
              <rect
                key={`${band}-${side}`}
                x={SIDES[side]}
                y={BANDS[band]}
                width={SIDE_W}
                height={BAND_H}
                rx="5"
                className="loc-zone"
                data-zone={`${band}-${side}`}
              />
            ) : null,
          ),
        )}

        {/* windscreen line, purely so the shape reads as a car */}
        <path d="M26 54 Q60 48 94 54" className="loc-detail" />
        <path d="M24 96 Q60 102 96 96" className="loc-detail" />

        <text x="60" y="9" className="loc-tick" textAnchor="middle">FRONT</text>
        <text x="60" y="150" className="loc-tick" textAnchor="middle">REAR</text>
      </svg>

      <div className="loc-text">
        <div className="loc-label">Where it is</div>
        <div className="loc-sentence" data-testid="location-sentence">
          {loc.sentence}
        </div>

        <div className="loc-axes">
          {loc.vertical && (
            <span className="loc-axis" data-axis="vertical">
              {loc.vertical === "lower" ? "↓ lower" : "↑ upper"}
            </span>
          )}
          {loc.radial && (
            <span className="loc-axis" data-axis="radial">
              {loc.radial === "inboard" ? "→ inboard" : "← outboard"}
            </span>
          )}
          {loc.sides.length === 2 && !loc.approximate && (
            <span className="loc-axis loc-axis-soft">both sides</span>
          )}
        </div>

        {loc.approximate && (
          <div className="loc-note" data-testid="location-approximate">
            Region only — the source gives no position for this fastener, so the whole{" "}
            {loc.regionLabel.toLowerCase()} area is shown rather than a guess.
          </div>
        )}
      </div>
    </div>
  );
}
