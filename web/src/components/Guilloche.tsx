/**
 * The engine-turned line-work on a banknote or share certificate, drawn rather
 * than imported: a hypotrochoid traced at high resolution, exactly as a rose
 * engine lathe would cut it. Two nested rosettes at different ratios give the
 * moire that makes the pattern hard to reproduce, which is the whole reason
 * securities used it.
 */
function rosette(R: number, r: number, d: number, turns: number, steps: number): string {
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * turns * Math.PI * 2;
    const k = (R - r) / r;
    const x = (R - r) * Math.cos(t) + d * Math.cos(k * t);
    const y = (R - r) * Math.sin(t) - d * Math.sin(k * t);
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return `M${pts.join("L")}`;
}

export function Guilloche({
  size = 260,
  className = "",
  opacity = 0.5,
}: {
  size?: number;
  className?: string;
  opacity?: number;
}) {
  const half = size / 2;
  return (
    <svg
      viewBox={`${-half} ${-half} ${size} ${size}`}
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={0.4}
        strokeLinejoin="round"
        opacity={opacity}
      >
        <path d={rosette(half * 0.94, half * 0.29, half * 0.47, 29, 2200)} />
        <path d={rosette(half * 0.68, half * 0.17, half * 0.38, 17, 1500)} opacity={0.7} />
        <circle r={half * 0.96} strokeWidth={0.7} />
        <circle r={half * 0.9} strokeWidth={0.35} />
      </g>
    </svg>
  );
}

/** A horizontal band of the same line-work, for rules across a document. */
export function GuillocheBand({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1200 26"
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <g fill="none" stroke="currentColor" strokeWidth={0.9} opacity={0.6}>
        {[0, 1, 2].map((lane) => {
          const phase = lane * 16;
          const amp = 7 - lane * 1.6;
          const d = Array.from({ length: 26 }, (_, i) => {
            const x = i * 48 + phase;
            return `M${x} 13 C ${x + 12} ${13 - amp}, ${x + 36} ${13 + amp}, ${x + 48} 13`;
          }).join(" ");
          return <path key={lane} d={d} opacity={0.5 + lane * 0.2} />;
        })}
        <path d="M0 1.5 H1248" strokeWidth={1.1} />
        <path d="M0 24.5 H1248" strokeWidth={1.1} />
      </g>
    </svg>
  );
}
