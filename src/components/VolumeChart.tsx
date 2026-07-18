"use client";

// Hand-rolled rather than pulling in recharts (~100KB) for a single chart, in a
// codebase that has no UI dependencies at all.
//
// A Catmull-Rom spline converted to cubic beziers gives the smooth curve the
// design calls for while still passing exactly through every real data point —
// unlike a plain bezier smoothing, which would round corners off the actual
// values and quietly misreport them.

export type Point = { date: string; total: number };

const W = 640;
const H = 180;
const PAD = { top: 12, right: 8, bottom: 22, left: 8 };

function buildPath(pts: { x: number; y: number }[], smoothing = 0.2): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;

  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + ((p2.x - p0.x) / 6) * smoothing * 3;
    const c1y = p1.y + ((p2.y - p0.y) / 6) * smoothing * 3;
    const c2x = p2.x - ((p3.x - p1.x) / 6) * smoothing * 3;
    const c2y = p2.y - ((p3.y - p1.y) / 6) * smoothing * 3;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

function label(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

export default function VolumeChart({ series }: { series: Point[] }) {
  if (series.length === 0) return null;

  const max = Math.max(1, ...series.map((p) => p.total));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const step = series.length > 1 ? innerW / (series.length - 1) : 0;

  const pts = series.map((p, i) => ({
    x: PAD.left + i * step,
    y: PAD.top + innerH - (p.total / max) * innerH,
  }));

  const line = buildPath(pts);
  const area = `${line} L ${pts[pts.length - 1].x} ${PAD.top + innerH} L ${pts[0].x} ${PAD.top + innerH} Z`;

  // First, last, and middle only — a 30-day axis can't fit 30 labels legibly.
  const ticks = [0, Math.floor((series.length - 1) / 2), series.length - 1].filter(
    (v, i, a) => a.indexOf(v) === i
  );

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-[180px] w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label={`Message volume over the last ${series.length} days`}
    >
      <defs>
        <linearGradient id="volume-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {[0, 0.5, 1].map((f) => (
        <line
          key={f}
          x1={PAD.left}
          x2={W - PAD.right}
          y1={PAD.top + innerH * f}
          y2={PAD.top + innerH * f}
          stroke="var(--border)"
          strokeWidth="1"
        />
      ))}

      <path d={area} fill="url(#volume-fill)" />
      <path
        d={line}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />

      {/* Only mark days that actually had traffic; a dot on every zero reads as
          data where there is none. */}
      {pts.map((p, i) =>
        series[i].total > 0 ? (
          <circle key={i} cx={p.x} cy={p.y} r="2.5" fill="var(--accent)">
            <title>{`${label(series[i].date)}: ${series[i].total} message${series[i].total === 1 ? "" : "s"}`}</title>
          </circle>
        ) : null
      )}

      {ticks.map((i) => (
        <text
          key={i}
          x={Math.min(W - PAD.right - 18, Math.max(PAD.left + 12, pts[i].x))}
          y={H - 4}
          textAnchor="middle"
          className="fill-[var(--text-5)]"
          style={{ fontSize: 10 }}
        >
          {label(series[i].date)}
        </text>
      ))}
    </svg>
  );
}
