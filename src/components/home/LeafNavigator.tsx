"use client";

import { useSetAtom } from "jotai";
import { useTranslations } from "next-intl";
import type {
  CSSProperties,
  FocusEvent,
  KeyboardEvent,
  MouseEvent,
  PointerEvent,
} from "react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { dropPct, LeafCard } from "@/components/home/LeafCard";
import { RelativeTime, useAgeLabel } from "@/components/home/RelativeTime";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import type { Category } from "@/lib/constants";
import type {
  HeroStatValues,
  LeafData,
  LeafListing,
} from "@/lib/home/leaf-data";
import {
  BUD_R,
  buildLeaf,
  LEAF_BASE,
  LEAF_VB,
  type LeafShape,
  NARROW_LABELS,
  WIDE_LABELS,
} from "@/lib/home/leaf-geometry";
import type { ServerCurrency } from "@/lib/market/currency";
import { R2Keys, readR2JSON } from "@/lib/r2";
import type { HomeFeedScan } from "@/lib/types";
import { expandedRefNumAtom } from "@/store/atoms";

const HEARTBEAT_DELAY_MS = 1000;
const ENTRANCE_MS = 900;
const PULSE_EVERY_MS = 5200;
const DRAG_START_PX = 8;
const MAX_LEAN_DEG = 8;
const REDUCED = "(prefers-reduced-motion: reduce)";
const NARROW = "(max-width: 600px)";

type Variant = "wide" | "narrow";

interface DragState {
  id: number;
  x0: number;
  y0: number;
  moved: boolean;
  target: Element;
  svg: SVGSVGElement;
  variant: Variant;
  key: string | null;
  type: string;
}

const subscribeNarrow = (onChange: () => void) => {
  const mq = matchMedia(NARROW);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
};
const getNarrow = () => matchMedia(NARROW).matches;
const getNarrowServer = () => null;

function pulse(g: SVGGElement, delay = 0) {
  const sap = g.querySelector<SVGPathElement>(".home-leaf-sap");
  const flash = g.querySelector<SVGCircleElement>(".home-leaf-flash");
  const pop = g.querySelector<SVGTextElement>(".home-leaf-pop");
  if (!sap || !flash || !pop) return;
  const len = sap.getTotalLength();
  sap.style.strokeDasharray = `${len * 0.28} ${len * 1.4}`;
  sap.animate(
    [
      { strokeDashoffset: len * 0.28, opacity: 1 },
      { strokeDashoffset: -len * 0.95, opacity: 1 },
      { strokeDashoffset: -len * 1.05, opacity: 0 },
    ],
    { duration: 1500, delay, easing: "cubic-bezier(.4,0,.3,1)" },
  );
  flash.animate(
    [
      { opacity: 0, transform: "scale(0.4)" },
      { opacity: 0.9, transform: "scale(1.2)", offset: 0.35 },
      { opacity: 0, transform: "scale(2.6)" },
    ],
    { duration: 1300, delay: delay + 1150, easing: "ease-out" },
  );
  pop.animate(
    [
      { opacity: 0, transform: "translateY(4px)" },
      { opacity: 1, transform: "translateY(0)", offset: 0.25 },
      { opacity: 1, offset: 0.7 },
      { opacity: 0, transform: "translateY(-6px)" },
    ],
    { duration: 1800, delay: delay + 1150, easing: "ease-out" },
  );
}

function LastScan({ scan }: { scan: HomeFeedScan }) {
  const t = useTranslations("home.hero.leaf");
  const [at, setAt] = useState(scan.at);

  // The cached page only knows the scan time as of its render; the heartbeat blob has the live one.
  useEffect(() => {
    let cancelled = false;
    const id = window.setTimeout(async () => {
      const blob = await readR2JSON<{ at?: unknown }>(
        R2Keys.runHeartbeat,
      ).catch(() => null);
      if (cancelled || typeof blob?.at !== "string") return;
      if (Number.isFinite(Date.parse(blob.at))) setAt(blob.at);
    }, HEARTBEAT_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, []);

  return (
    <>
      {t("lastScan")} <RelativeTime iso={at} />
    </>
  );
}

const angleDelta = (a: number, b: number) => {
  let d = a - b;
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return d;
};

const visibleSvg = (root: HTMLElement | null) =>
  [...(root?.querySelectorAll<SVGSVGElement>(".home-leaf-svg") ?? [])].find(
    (svg) => getComputedStyle(svg).display !== "none",
  ) ?? null;

export function LeafNavigator({
  leaf,
  stats,
  scan,
  currency,
}: {
  leaf: LeafData;
  stats: HeroStatValues;
  scan: HomeFeedScan | null;
  currency: ServerCurrency;
}) {
  const t = useTranslations("home.hero.leaf");
  const tCategories = useTranslations("categories");
  const setRefNum = useSetAtom(expandedRefNumAtom);
  const ageLabel = useAgeLabel();
  const { symbol, rate } = useDisplayCurrency(currency);
  const narrow = useSyncExternalStore(
    subscribeNarrow,
    getNarrow,
    getNarrowServer,
  );

  const [preview, setPreview] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [feat, setFeat] = useState<{ scope: string | null; idx: number }>({
    scope: null,
    idx: 0,
  });
  const [dragging, setDragging] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const previewRef = useRef<string | null>(null);
  previewRef.current = preview;
  const pinnedRef = useRef(pinned);
  pinnedRef.current = pinned;

  const categoryName = (c: string) => tCategories(c as Category);
  const byKey = useMemo(
    () => new Map(leaf.cats.map((c) => [c.c, c])),
    [leaf.cats],
  );
  const newsOf = (key: string) => {
    const c = byKey.get(key);
    if (!c) return "";
    if (c.newCnt) return t("newShort", { count: c.newCnt });
    if (c.dropCnt) return t("dropShort", { count: c.dropCnt });
    return "";
  };
  const shapes = useMemo(() => {
    const input = leaf.cats.map((c) => {
      const news = c.newCnt
        ? t("newShort", { count: c.newCnt })
        : c.dropCnt
          ? t("dropShort", { count: c.dropCnt })
          : "";
      return {
        key: c.c,
        cnt: c.cnt,
        name: tCategories(c.c as Category),
        sub: news ? `${c.cnt}  ${news}` : String(c.cnt),
      };
    });
    return {
      wide: buildLeaf(input, leaf.seed, WIDE_LABELS),
      narrow: buildLeaf(input, leaf.seed, NARROW_LABELS),
    };
  }, [leaf, t, tCategories]);

  const active = preview ?? pinned;
  const cat = active ? (byKey.get(active) ?? null) : null;
  const list = cat ? cat.feat : leaf.feat;
  const index = Math.min(
    feat.scope === active ? feat.idx : 0,
    Math.max(0, list.length - 1),
  );

  const money = (usd: number, whole = false) =>
    whole
      ? `${symbol}${Math.round(usd * rate)}`
      : `${symbol}${(usd * rate).toFixed(2)}`;

  useEffect(() => {
    if (matchMedia(REDUCED).matches) return;
    const keys = leaf.cats
      .filter((c) => c.newCnt > 0 || c.dropCnt > 0)
      .map((c) => c.c);
    if (!keys.length) return;
    const leafletOf = (key: string) =>
      visibleSvg(rootRef.current)?.querySelector<SVGGElement>(
        `[data-c="${key}"]`,
      );
    let n = 0;
    const first = window.setTimeout(() => {
      if (document.hidden) return;
      for (const [i, key] of keys.entries()) {
        const g = leafletOf(key);
        if (g) pulse(g, i * 180);
      }
    }, ENTRANCE_MS);
    const every = window.setInterval(() => {
      if (document.hidden || dragRef.current || previewRef.current) return;
      const g = leafletOf(keys[n++ % keys.length]);
      if (g) pulse(g);
    }, PULSE_EVERY_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
    };
  }, [leaf.cats]);

  const toView = (e: PointerEvent, svg: SVGSVGElement) => {
    const r = svg.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (LEAF_VB.w / r.width),
      y: (e.clientY - r.top) * (LEAF_VB.h / r.height),
    };
  };
  const leafAtAngle = (shape: LeafShape, p: { x: number; y: number }) => {
    const a = Math.atan2(p.y - LEAF_BASE.y, p.x - LEAF_BASE.x);
    let best: LeafShape["leaflets"][number] | null = null;
    let bd = Number.POSITIVE_INFINITY;
    for (const l of shape.leaflets) {
      const d = Math.abs(angleDelta(a, l.ang));
      if (d < bd) {
        bd = d;
        best = l;
      }
    }
    return best;
  };
  const leanTo = (
    d: DragState | null,
    key: string | null,
    p?: { x: number; y: number },
  ) => {
    const root = rootRef.current;
    for (const el of root?.querySelectorAll<SVGGElement>(
      ".home-leaf-lf, .home-leaf-buds",
    ) ?? [])
      el.style.transform = "";
    if (!d || !key || !p || matchMedia(REDUCED).matches) return;
    const l = shapes[d.variant].leaflets.find((x) => x.key === key);
    const g = d.svg.querySelector<SVGGElement>(`[data-c="${key}"]`);
    if (!l || !g) return;
    const delta = angleDelta(
      Math.atan2(p.y - LEAF_BASE.y, p.x - LEAF_BASE.x),
      l.ang,
    );
    const deg = Math.max(
      -MAX_LEAN_DEG,
      Math.min(MAX_LEAN_DEG, ((delta * 180) / Math.PI) * 0.55),
    );
    const tr = `rotate(${deg.toFixed(2)}deg)`;
    g.style.transform = tr;
    const buds = d.svg.querySelector<SVGGElement>(".home-leaf-buds");
    if (buds) buds.style.transform = tr;
  };

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    dragRef.current = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      moved: false,
      target: e.target as Element,
      svg: e.currentTarget,
      variant: e.currentTarget.dataset.variant === "narrow" ? "narrow" : "wide",
      key: null,
      type: e.pointerType,
    };
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.id) return;
    if (!d.moved) {
      const dx = e.clientX - d.x0;
      const dy = e.clientY - d.y0;
      if (Math.hypot(dx, dy) < DRAG_START_PX) return;
      if (d.type !== "mouse" && Math.abs(dy) > Math.abs(dx)) {
        dragRef.current = null;
        return;
      }
      d.moved = true;
      try {
        d.svg.setPointerCapture(e.pointerId);
      } catch {}
      setDragging(true);
    }
    const p = toView(e, d.svg);
    d.key = leafAtAngle(shapes[d.variant], p)?.key ?? null;
    leanTo(d, d.key, p);
    if (d.key && d.key !== previewRef.current) setPreview(d.key);
  };
  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.id) return;
    dragRef.current = null;
    if (d.moved) {
      setDragging(false);
      leanTo(null, null);
      if (d.key) {
        setPinned(d.key);
        if (d.type !== "mouse") setPreview(null);
      }
      return;
    }
    if (d.target.closest(".home-leaf-buds")) return;
    const key = d.target.closest<SVGGElement>("[data-c]")?.dataset.c ?? null;
    if (key) {
      setPinned(pinnedRef.current === key ? null : key);
      if (d.type !== "mouse") setPreview(null);
    } else {
      setPinned(null);
      setPreview(null);
    }
  };
  const onPointerCancel = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    leanTo(null, null);
  };
  const onPointerOver = (e: PointerEvent<SVGSVGElement>) => {
    if (e.pointerType !== "mouse" || dragRef.current?.moved) return;
    const el = e.target as Element;
    if (el.closest(".home-leaf-buds")) return;
    setPreview(el.closest<SVGGElement>("[data-c]")?.dataset.c ?? null);
  };
  const onPointerLeave = (e: PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === "mouse" && !dragRef.current?.moved) setPreview(null);
  };
  const onBlur = (e: FocusEvent<SVGSVGElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null))
      setPreview(null);
  };
  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === "Escape") {
      setPinned(null);
      setPreview(null);
      (document.activeElement as HTMLElement | SVGElement | null)?.blur();
      return;
    }
    const key = (e.target as Element).closest<SVGGElement>("[data-c]")?.dataset
      .c;
    if (!key) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setPinned(pinnedRef.current === key ? null : key);
      return;
    }
    const dir =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (!dir) return;
    e.preventDefault();
    const order = [...shapes.wide.leaflets].sort((a, b) => a.ang - b.ang);
    const i = order.findIndex((l) => l.key === key);
    const next = order[(i + dir + order.length) % order.length];
    e.currentTarget
      .querySelector<SVGGElement>(`[data-c="${next.key}"]`)
      ?.focus();
  };

  const openItem = (e: MouseEvent<Element>, ref: string) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    setRefNum(ref);
  };
  const kindLabel = (f: LeafListing) =>
    f.k === "new"
      ? t("badge.new")
      : f.k === "drop"
        ? `−${dropPct(f)}%`
        : t("badge.cheapest");
  const budLabel = (f: LeafListing) =>
    [f.n, kindLabel(f), f.k !== "cheap" && f.at ? ageLabel(f.at) : null, f.s]
      .filter(Boolean)
      .join(" · ");
  const leafletLabel = (key: string) => {
    const c = byKey.get(key);
    if (!c) return key;
    return [
      t("leaflet", { name: categoryName(key), count: c.cnt }),
      c.newCnt ? t("leafletNew", { count: c.newCnt }) : null,
      c.dropCnt ? t("leafletDrops", { count: c.dropCnt }) : null,
    ]
      .filter(Boolean)
      .join(", ");
  };

  const renderLeaf = (variant: Variant) => {
    const shape = shapes[variant];
    const activeShape = active
      ? (shape.leaflets.find((l) => l.key === active) ?? null)
      : null;
    const buds =
      cat && activeShape
        ? cat.feat
            .slice(0, activeShape.buds.length)
            .map((f, k) => ({ f, at: activeShape.buds[k] }))
        : [];
    const showImages = narrow != null && narrow === (variant === "narrow");
    const svgClass = [
      "home-leaf-svg",
      `home-leaf-svg--${variant}`,
      active ? "has-focus" : "",
      dragging ? "is-dragging" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const halo = `home-leaf-halo-${variant}`;

    return (
      <svg
        className={svgClass}
        data-variant={variant}
        viewBox={`0 0 ${LEAF_VB.w} ${LEAF_VB.h}`}
        aria-label={t("aria")}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerOver={onPointerOver}
        onPointerLeave={onPointerLeave}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
      >
        <defs>
          <radialGradient id={halo} cx="50%" cy="58%" r="50%">
            <stop offset="0" className="home-leaf-halo-in" />
            <stop offset="1" className="home-leaf-halo-out" />
          </radialGradient>
        </defs>
        <ellipse
          className="home-leaf-halo"
          fill={`url(#${halo})`}
          cx="260"
          cy="230"
          rx="250"
          ry="190"
        />
        <path className="home-leaf-stem" d={shape.stem} />
        <g className="home-leaf-leaflets">
          {shape.leaflets.map((l, i) => {
            const c = byKey.get(l.key);
            const news = newsOf(l.key);
            const hasNews = !!c && (c.newCnt > 0 || c.dropCnt > 0);
            const cls = [
              "home-leaf-lf",
              l.key === preview ? "is-hot" : "",
              l.key === pinned ? "is-sel" : "",
              hasNews ? "has-news" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              // biome-ignore lint/a11y/useSemanticElements: SVG has no <button>; each leaflet is a toggle
              <g
                key={l.key}
                data-c={l.key}
                className={cls}
                tabIndex={0}
                role="button"
                aria-pressed={l.key === pinned}
                aria-label={leafletLabel(l.key)}
                onFocus={() => setPreview(l.key)}
              >
                <g
                  className="home-leaf-inner"
                  style={{ "--i": i } as CSSProperties}
                >
                  <path className="home-leaf-hit" d={l.hit} />
                  <path className="home-leaf-shape" d={l.shape} />
                  <path className="home-leaf-veins" d={l.veins} />
                  <path className="home-leaf-rib" d={l.rib} />
                  {hasNews && c && (
                    <>
                      <path className="home-leaf-sap" d={l.rib} />
                      <circle
                        className="home-leaf-flash"
                        cx={l.tip.x}
                        cy={l.tip.y}
                        r="5"
                      />
                      <text
                        className="home-leaf-pop"
                        x={l.pop.x}
                        y={l.pop.y}
                        textAnchor="middle"
                      >
                        {c.newCnt ? `+${c.newCnt}` : `−${c.dropCnt}`}
                      </text>
                    </>
                  )}
                  <text
                    className="home-leaf-label"
                    x={l.label.x}
                    y={l.label.y}
                    textAnchor={l.label.anchor}
                  >
                    <tspan className="home-leaf-name">
                      {categoryName(l.key)}
                    </tspan>
                    <tspan
                      className="home-leaf-count"
                      x={l.label.x}
                      dy="1.15em"
                    >
                      {c?.cnt ?? 0}
                    </tspan>
                    {news && (
                      <tspan className="home-leaf-news" dx="6">
                        {news}
                      </tspan>
                    )}
                  </text>
                </g>
              </g>
            );
          })}
        </g>
        <g className="home-leaf-buds">
          {buds.map(({ f, at }, k) => {
            const clip = `home-leaf-clip-${variant}-${k}`;
            return (
              <a
                key={`${active}-${f.ref}`}
                href={`/item/${encodeURIComponent(f.ref)}`}
                className={`home-leaf-bud${k === index ? " is-on" : ""}`}
                aria-label={budLabel(f)}
                onClick={(e) => openItem(e, f.ref)}
                onPointerEnter={() => setFeat({ scope: active, idx: k })}
                onFocus={() => setFeat({ scope: active, idx: k })}
                style={{ "--k": k } as CSSProperties}
              >
                <clipPath id={clip}>
                  <circle cx={at.x} cy={at.y} r={BUD_R - 1} />
                </clipPath>
                <circle
                  className="home-leaf-bud-under"
                  cx={at.x}
                  cy={at.y}
                  r={BUD_R}
                />
                {showImages && f.img && (
                  <image
                    href={f.img}
                    x={Number(at.x) - BUD_R}
                    y={Number(at.y) - BUD_R}
                    width={BUD_R * 2}
                    height={BUD_R * 2}
                    clipPath={`url(#${clip})`}
                    preserveAspectRatio="xMidYMid slice"
                  />
                )}
                <circle
                  className="home-leaf-bud-ring"
                  cx={at.x}
                  cy={at.y}
                  r={BUD_R - 0.5}
                />
                <circle
                  className="home-leaf-bud-ring2"
                  cx={at.x}
                  cy={at.y}
                  r={BUD_R + 1}
                />
              </a>
            );
          })}
        </g>
      </svg>
    );
  };

  return (
    <div ref={rootRef} className="home-leaf">
      {renderLeaf("wide")}
      {renderLeaf("narrow")}

      <p className="home-leaf-hint">
        {t("hint")}
        {scan?.at && (
          <>
            {" · "}
            <LastScan scan={scan} />
          </>
        )}
      </p>

      <LeafCard
        cat={cat}
        cats={leaf.cats}
        stats={stats}
        isPreview={!!preview && preview !== pinned}
        pinned={pinned != null}
        list={list}
        index={index}
        money={money}
        categoryName={categoryName}
        onClear={() => {
          setPinned(null);
          setPreview(null);
        }}
        onStep={(delta) =>
          setFeat({
            scope: active,
            idx: Math.max(0, Math.min(list.length - 1, index + delta)),
          })
        }
        onOpen={(ref) => setRefNum(ref)}
      />
    </div>
  );
}
