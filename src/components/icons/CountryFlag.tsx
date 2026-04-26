/**
 * CountryFlag — small circular SVG flag for market countries.
 * Simplified stripe-based representations that render crisply at 14–20 px.
 * Adapted from food-aggregator pattern. Add more flags as new markets launch.
 */

const S = 100; // viewBox size

interface FlagDef {
  colors: string[];
  dir?: "v";
  w?: number[];
}

/** Keyed by lowercase ISO-3166-1 alpha-2 code */
const FLAGS: Record<string, FlagDef> = {
  gb: { colors: ["#012169"] }, // Union Jack (overlay does the cross)
  de: { colors: ["#000", "#dd0000", "#ffcc00"] },
  fr: { colors: ["#002395", "#fff", "#ed2939"], dir: "v" },
  pt: { colors: ["#006600", "#ff0000"], dir: "v", w: [2, 3] },
  it: { colors: ["#009344", "#fff", "#cf2734"], dir: "v" },
  es: { colors: ["#c60b1e", "#ffc400", "#c60b1e"], w: [1, 2, 1] },
  nl: { colors: ["#ae1c28", "#fff", "#21468b"] },
  be: { colors: ["#000", "#ffd90c", "#f31830"], dir: "v" },
  cz: { colors: ["#fff", "#d7141a"] }, // triangle overlay
  at: { colors: ["#ed2939", "#fff", "#ed2939"] },
  ch: { colors: ["#ff0000"] }, // cross overlay
  pl: { colors: ["#fff", "#dc143c"] },
  dk: { colors: ["#c60c30"] }, // cross overlay
  se: { colors: ["#004b87"] }, // cross overlay
  ie: { colors: ["#169b62", "#fff", "#ff883e"], dir: "v" },
  us: { colors: ["#002868"] }, // simplified
  ca: { colors: ["#ff0000", "#fff", "#ff0000"], dir: "v", w: [1, 2, 1] },
  th: { colors: ["#ed1c24", "#fff", "#241d4f", "#fff", "#ed1c24"] },
  ma: { colors: ["#c1272d"] }, // star overlay
  gr: {
    // 9 alternating blue/white horizontal stripes (canton drawn as overlay)
    colors: [
      "#0d5eaf",
      "#fff",
      "#0d5eaf",
      "#fff",
      "#0d5eaf",
      "#fff",
      "#0d5eaf",
      "#fff",
      "#0d5eaf",
    ],
  },
};

/** Special overlays for emblems / complex geometry */
const OVERLAYS: Record<string, () => React.JSX.Element> = {
  gb: () => (
    <>
      {/* Saltire (diagonal white + red) */}
      <line x1={0} y1={0} x2={S} y2={S} stroke="#fff" strokeWidth={16} />
      <line x1={S} y1={0} x2={0} y2={S} stroke="#fff" strokeWidth={16} />
      <line x1={0} y1={0} x2={S} y2={S} stroke="#cf142b" strokeWidth={6} />
      <line x1={S} y1={0} x2={0} y2={S} stroke="#cf142b" strokeWidth={6} />
      {/* Cross (white + red) */}
      <line x1={50} y1={0} x2={50} y2={S} stroke="#fff" strokeWidth={22} />
      <line x1={0} y1={50} x2={S} y2={50} stroke="#fff" strokeWidth={22} />
      <line x1={50} y1={0} x2={50} y2={S} stroke="#cf142b" strokeWidth={12} />
      <line x1={0} y1={50} x2={S} y2={50} stroke="#cf142b" strokeWidth={12} />
    </>
  ),
  cz: () => <polygon points="0,0 50,50 0,100" fill="#11457e" />,
  ch: () => (
    <>
      <rect x={38} y={20} width={24} height={60} fill="#fff" />
      <rect x={20} y={38} width={60} height={24} fill="#fff" />
    </>
  ),
  dk: () => (
    <>
      <rect x={28} y={0} width={16} height={S} fill="#fff" />
      <rect x={0} y={38} width={S} height={16} fill="#fff" />
    </>
  ),
  se: () => (
    <>
      <rect x={28} y={0} width={16} height={S} fill="#fecc00" />
      <rect x={0} y={38} width={S} height={16} fill="#fecc00" />
    </>
  ),
  us: () => (
    <>
      {/* Stripes */}
      {[0, 2, 4, 6, 8, 10, 12].map((i) => (
        <rect
          key={i}
          x={0}
          y={(i * S) / 13}
          width={S}
          height={S / 13}
          fill={i % 2 === 0 ? "#bf0a30" : "#fff"}
        />
      ))}
      {[1, 3, 5, 7, 9, 11].map((i) => (
        <rect
          key={i}
          x={0}
          y={(i * S) / 13}
          width={S}
          height={S / 13}
          fill="#fff"
        />
      ))}
      {/* Blue canton */}
      <rect x={0} y={0} width={42} height={54} fill="#002868" />
    </>
  ),
  ma: () => (
    <polygon
      points="50,25 56,43 75,43 60,54 66,72 50,61 34,72 40,54 25,43 44,43"
      fill="#006233"
      fillRule="evenodd"
    />
  ),
  gr: () => {
    // Canton: top-left, 5 stripes tall × 5/9 wide, with white cross
    const cantonSize = (S * 5) / 9;
    const crossW = S / 9;
    const crossCenter = cantonSize / 2;
    return (
      <>
        <rect
          x={0}
          y={0}
          width={cantonSize}
          height={cantonSize}
          fill="#0d5eaf"
        />
        <rect
          x={crossCenter - crossW / 2}
          y={0}
          width={crossW}
          height={cantonSize}
          fill="#fff"
        />
        <rect
          x={0}
          y={crossCenter - crossW / 2}
          width={cantonSize}
          height={crossW}
          fill="#fff"
        />
      </>
    );
  },
};

function renderStripes(def: FlagDef) {
  const { colors, dir, w } = def;
  const weights = w ?? colors.map(() => 1);
  const total = weights.reduce((s, v) => s + v, 0);
  let pos = 0;

  return colors.map((color, i) => {
    const span = (weights[i] / total) * S;
    const rect =
      dir === "v" ? (
        <rect key={i} x={pos} y={0} width={span} height={S} fill={color} />
      ) : (
        <rect key={i} x={0} y={pos} width={S} height={span} fill={color} />
      );
    pos += span;
    return rect;
  });
}

interface CountryFlagProps {
  /** ISO-3166-1 alpha-2 code (e.g. "GB", "DE") — case-insensitive */
  code: string;
  /** Rendered pixel size (default 16) */
  size?: number;
}

export function CountryFlag({ code, size = 16 }: CountryFlagProps) {
  const lc = code.toLowerCase();
  const def = FLAGS[lc];

  if (!def) {
    return (
      <span
        className="inline-flex items-center justify-center rounded-full bg-muted text-muted-foreground shrink-0"
        style={{
          width: size,
          height: size,
          fontSize: size * 0.55,
          lineHeight: 1,
        }}
      >
        {code.charAt(0).toUpperCase()}
      </span>
    );
  }

  const Overlay = OVERLAYS[lc];

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${S} ${S}`}
      role="img"
      aria-label={`${code} flag`}
      className="shrink-0"
      style={{ borderRadius: "50%", overflow: "hidden" }}
    >
      {renderStripes(def)}
      {Overlay && <Overlay />}
    </svg>
  );
}
