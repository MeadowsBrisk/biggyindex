export const LEAF_VB = { w: 520, h: 440 };
export const LEAF_BASE = { x: 260, y: 348 };
export const BUD_R = 16;

const OFF = 6;
const BUD_GAP = 2 * BUD_R + 8;
const FRAME_X = 8;
const FRAME_Y = 6;
const NAME_RISE = 5;

export interface LabelMetrics {
  nameChar: number;
  countChar: number;
  above: number;
  below: number;
}

export const WIDE_LABELS: LabelMetrics = {
  nameChar: 7,
  countChar: 6.7,
  above: 12,
  below: 18,
};

export const NARROW_LABELS: LabelMetrics = {
  nameChar: (7 / 12) * 16,
  countChar: (6.7 / 11) * 14.5,
  above: 0.8 * 16,
  below: (1.15 + 0.28) * 14.5,
};

type Pt = [number, number];

export interface Phenotype {
  width: number;
  spread: number;
  droop: number;
  teeth: number;
  depth: number;
  taper: number;
  bend: number;
  tilt: number;
  stemBend: number;
  veins: number;
}

export interface LeafInput {
  key: string;
  cnt: number;
  name: string;
  sub: string;
}

interface Placed extends LeafInput {
  ang: number;
  L: number;
  bend: number;
  side: number;
}

export interface LeafletShape {
  key: string;
  ang: number;
  hit: string;
  shape: string;
  veins: string;
  rib: string;
  tip: { x: string; y: string };
  pop: { x: string; y: string };
  label: { x: string; y: string; anchor: "start" | "middle" | "end" };
  buds: { x: string; y: string }[];
}

export interface LeafShape {
  stem: string;
  leaflets: LeafletShape[];
}

export function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function phenotype(seed: number): Phenotype {
  const r = rng(seed);
  return {
    width: 0.82 + r() * 0.4,
    spread: 100 + r() * 16,
    droop: r() * 8,
    teeth: 9 + r() * 5,
    depth: 0.13 + r() * 0.17,
    taper: 0.7 + r() * 0.25,
    bend: 0.6 + r() * 0.9,
    tilt: (r() - 0.5) * 5,
    stemBend: (r() - 0.5) * 18,
    veins: 28 + r() * 14,
  };
}

function hw(L: number, t: number, ph: Phenotype): number {
  return (
    (t <= 0 || t >= 1
      ? 0
      : L *
        0.125 *
        ph.width *
        Math.sin(Math.PI * t) ** ph.taper *
        (1 - 0.3 * t)) + 1.3
  );
}

function geo(lf: Pick<Placed, "ang" | "L" | "bend">) {
  const dx = Math.cos(lf.ang);
  const dy = Math.sin(lf.ang);
  const nx = -dy;
  const ny = dx;
  const pt = (t: number, off: number): Pt => {
    const b = lf.bend * 4 * t * (1 - t);
    return [
      LEAF_BASE.x + dx * (OFF + t * lf.L) + nx * (off + b),
      LEAF_BASE.y + dy * (OFF + t * lf.L) + ny * (off + b),
    ];
  };
  return { dx, dy, pt };
}

const f1 = (n: number) => n.toFixed(1);
const fmt = (p: Pt) => `${f1(p[0])} ${f1(p[1])}`;

function edge(lf: Placed, ph: Phenotype, pad = 0): string {
  const { pt } = geo(lf);
  const N = pad ? 24 : 76;
  const teeth = Math.max(7, Math.round(lf.L / ph.teeth));
  const a: Pt[] = [];
  const b: Pt[] = [];
  for (let k = 0; k <= N; k++) {
    const t = k / N;
    const saw = pad ? 1 : t > 0.07 && t < 0.97 ? (t * teeth) % 1 : 0.5;
    const w =
      hw(lf.L, t, ph) * (1 - ph.depth / 2 + ph.depth * saw) +
      pad * Math.sin(Math.PI * Math.min(1, t * 1.15));
    a.push(pt(t, w));
    b.push(pt(t, -w));
  }
  return `M${a.concat(b.reverse()).map(fmt).join("L")}Z`;
}

function ribD(lf: Placed): string {
  const { pt } = geo(lf);
  const p: Pt[] = [];
  for (let k = 0; k <= 24; k++) p.push(pt((k / 24) * 0.97, 0));
  return `M${p.map(fmt).join("L")}`;
}

function veinsD(lf: Placed, ph: Phenotype): string {
  const { pt } = geo(lf);
  const count = Math.max(3, Math.round(lf.L / ph.veins));
  let d = "";
  for (let k = 1; k <= count; k++) {
    const t = 0.1 + (k / (count + 1)) * 0.78;
    for (const s of [1, -1]) {
      const a = pt(t, 0);
      const b = pt(Math.min(0.97, t + 0.09), s * hw(lf.L, t + 0.09, ph) * 0.72);
      d += `M${fmt(a)}L${fmt(b)}`;
    }
  }
  return d;
}

function labelBox(lf: Placed, m: LabelMetrics) {
  const { dx, dy, pt } = geo(lf);
  const tip = pt(1, 0);
  const gx = tip[0] + dx * 14;
  const gy = tip[1] + dy * 14 + (dy < -0.6 ? -6 : 0);
  const w = Math.max(lf.name.length * m.nameChar, lf.sub.length * m.countChar);
  const x0 = dx > 0.3 ? gx : dx < -0.3 ? gx - w : gx - w / 2;
  const anchor: "start" | "middle" | "end" =
    dx > 0.3 ? "start" : dx < -0.3 ? "end" : "middle";
  const base = gy - NAME_RISE;
  return {
    gx,
    base,
    anchor,
    x0,
    x1: x0 + w,
    y0: base - m.above,
    y1: base + m.below,
  };
}

function budCount(L: number): number {
  return L < 130 ? 1 : L < 185 ? 2 : 3;
}

function budSlots(lf: Placed, ph: Phenotype): Pt[] {
  const n = budCount(lf.L);
  const { pt } = geo(lf);
  if (n === 1) return [pt(0.6, 0)];
  const place = (s: number) => {
    const half = ((n - 1) / 2) * s;
    const centre = Math.min(Math.max(0.58, 0.2 + half), 0.9 - half);
    return Array.from({ length: n }, (_, k) => {
      const t = centre + (k - (n - 1) / 2) * s;
      return pt(t, (k % 2 ? -1 : 1) * 0.35 * hw(lf.L, t, ph));
    });
  };
  const gapOk = (pts: Pt[]) =>
    pts.every(
      (p, k) =>
        k === 0 ||
        Math.hypot(p[0] - pts[k - 1][0], p[1] - pts[k - 1][1]) >= BUD_GAP,
    );
  let s = Math.max(BUD_GAP / lf.L, 0.17);
  let pts = place(s);
  while (!gapOk(pts) && s < 0.5) {
    s += 0.01;
    pts = place(s);
  }
  return pts;
}

function fits(list: Placed[], ph: Phenotype, m: LabelMetrics): boolean {
  let x0 = LEAF_BASE.x;
  let x1 = LEAF_BASE.x;
  let y0 = LEAF_BASE.y;
  let y1 = LEAF_BASE.y + 48;
  const up = (x: number, y: number) => {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  };
  for (const lf of list) {
    const { pt } = geo(lf);
    for (const t of [0.25, 0.45, 0.65, 0.85, 1]) {
      for (const s of [1, -1]) {
        const p = pt(t, s * (hw(lf.L, t, ph) * 1.12 + 2));
        up(p[0], p[1]);
      }
    }
    for (const b of budSlots(lf, ph)) {
      up(b[0] - BUD_R - 2, b[1] - BUD_R - 2);
      up(b[0] + BUD_R + 2, b[1] + BUD_R + 2);
    }
    const box = labelBox(lf, m);
    up(box.x0, box.y0);
    up(box.x1, box.y1);
  }
  return (
    x0 >= FRAME_X &&
    x1 <= LEAF_VB.w - FRAME_X &&
    y0 >= FRAME_Y &&
    y1 <= LEAF_VB.h - FRAME_Y
  );
}

type LabelBox = ReturnType<typeof labelBox>;

const shiftBox = (b: LabelBox, x: number, y: number): LabelBox => ({
  ...b,
  gx: b.gx + x,
  base: b.base + y,
  x0: b.x0 + x,
  x1: b.x1 + x,
  y0: b.y0 + y,
  y1: b.y1 + y,
});

function separateLabels(boxes: LabelBox[]): LabelBox[] {
  const out: LabelBox[] = [];
  for (const start of boxes) {
    let b = start;
    for (let pass = 0; pass < 12; pass++) {
      const hit = out.find(
        (a) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1,
      );
      if (!hit) break;
      const right = b.x0 + b.x1 > hit.x0 + hit.x1;
      const down = b.y0 + b.y1 > hit.y0 + hit.y1;
      const penX = (right ? hit.x1 - b.x0 : b.x1 - hit.x0) + 2;
      const penY = (down ? hit.y1 - b.y0 : b.y1 - hit.y0) + 2;
      const moved =
        penX < penY
          ? shiftBox(b, right ? penX : -penX, 0)
          : shiftBox(b, 0, down ? penY : -penY);
      const cx =
        Math.min(0, LEAF_VB.w - FRAME_X - moved.x1) ||
        Math.max(0, FRAME_X - moved.x0);
      const cy =
        Math.min(0, LEAF_VB.h - FRAME_Y - moved.y1) ||
        Math.max(0, FRAME_Y - moved.y0);
      b = shiftBox(moved, cx, cy);
    }
    out.push(b);
  }
  return out;
}

function layout(
  list: LeafInput[],
  seed: number,
  ph: Phenotype,
  m: LabelMetrics,
): Placed[] {
  const r = rng(seed ^ 0x9e3779b9);
  const max = Math.max(1, ...list.map((c) => c.cnt));
  const pairs = Math.max(1, Math.ceil((list.length - 1) / 2));
  const out = list.map((c, i) => {
    const side = i === 0 ? 0 : i % 2 ? 1 : -1;
    const j = Math.ceil(i / 2);
    const outer = j / pairs;
    const deg =
      -90 +
      ph.tilt +
      side * (j * (ph.spread / pairs) + ph.droop * outer * outer) +
      (r() - 0.5) * 4;
    const L =
      (72 + 214 * Math.sqrt(c.cnt / max) * (1 - 0.08 * outer)) *
      (0.96 + r() * 0.08);
    return {
      ...c,
      ang: (deg * Math.PI) / 180,
      L,
      bend: ((r() - 0.5) * 14 + side * 5) * ph.bend,
      side,
    };
  });
  // Shrink until every leaflet, bud and label sits inside the frame; step 0.02 down to 0.2.
  for (let step = 0; step <= 40; step++) {
    const k = 1 - step * 0.02;
    const scaled = out.map((l) => ({ ...l, L: l.L * k }));
    if (fits(scaled, ph, m) || step === 40) return scaled;
  }
  return out;
}

export function buildLeaf(
  list: LeafInput[],
  seedKey: string,
  m: LabelMetrics,
): LeafShape {
  const seed = hashSeed(seedKey);
  const ph = phenotype(seed);
  const placed = list.length ? layout(list, seed, ph, m) : [];
  const { x, y } = LEAF_BASE;
  const labels = separateLabels(placed.map((lf) => labelBox(lf, m)));
  return {
    stem: `M${x} ${y + 4} Q ${f1(x + ph.stemBend * 0.4)} ${y + 22} ${f1(x + ph.stemBend * 0.2 - 2)} ${y + 44}`,
    leaflets: placed.map((lf, i) => {
      const { dx, dy, pt } = geo(lf);
      const tip = pt(1, 0);
      const lb = labels[i];
      return {
        key: lf.key,
        ang: lf.ang,
        hit: edge(lf, ph, 9),
        shape: edge(lf, ph),
        veins: veinsD(lf, ph),
        rib: ribD(lf),
        tip: { x: f1(tip[0]), y: f1(tip[1]) },
        pop: { x: f1(tip[0] + dx * 4), y: f1(tip[1] + dy * 4 - 10) },
        label: { x: f1(lb.gx), y: f1(lb.base), anchor: lb.anchor },
        buds: budSlots(lf, ph).map((b) => ({ x: f1(b[0]), y: f1(b[1]) })),
      };
    }),
  };
}
