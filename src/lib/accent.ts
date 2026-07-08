/**
 * Custom-accent CSS variable computation — shared between the pre-hydration
 * boot script in `app/[locale]/layout.tsx` and the post-hydration AccentSync
 * (`components/SettingsSync.tsx`).
 *
 * IMPORTANT: `computeCustomAccentVars` is embedded into the layout's inline
 * <script> via `Function.prototype.toString()`, so it MUST stay fully
 * self-contained — no imports, no references to module-scope helpers or
 * constants, browser-safe JS only. That guarantees the pre-paint script and
 * AccentSync compute byte-identical values, making the hydration pass a
 * visual no-op (this is what fixes the custom-accent flash the old boot
 * veil used to mask).
 */

export interface CustomAccentVars {
  primary: string;
  accent: string;
  gradient: string;
  foreground: string;
}

export function computeCustomAccentVars(
  hex: string,
  isDark: boolean,
): CustomAccentVars {
  /** Lighten a hex color by mixing with white */
  function lighten(base: string, amount: number): string {
    const r = Number.parseInt(base.slice(1, 3), 16);
    const g = Number.parseInt(base.slice(3, 5), 16);
    const b = Number.parseInt(base.slice(5, 7), 16);
    const mix = (channel: number) =>
      Math.round(channel + (255 - channel) * amount);
    return `#${[mix(r), mix(g), mix(b)].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
  }

  /** Shift hue slightly for gradient variety */
  function shiftHue(base: string, degrees: number): string {
    let r = Number.parseInt(base.slice(1, 3), 16) / 255;
    let g = Number.parseInt(base.slice(3, 5), 16) / 255;
    let b = Number.parseInt(base.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0;
    let s = 0;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    h = ((h * 360 + degrees) % 360) / 360;
    const hue2rgb = (p: number, q: number, t: number) => {
      const normalized = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
      if (normalized < 1 / 6) return p + (q - p) * 6 * normalized;
      if (normalized < 1 / 2) return q;
      if (normalized < 2 / 3) return p + (q - p) * (2 / 3 - normalized) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
    return `#${[r, g, b]
      .map((channel) =>
        Math.round(channel * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")}`;
  }

  const primary = isDark ? lighten(hex, 0.35) : hex;
  const accent = isDark ? lighten(hex, 0.5) : lighten(hex, 0.15);
  const mid = shiftHue(hex, 30);
  const end = shiftHue(hex, 60);
  const gradient = isDark
    ? `linear-gradient(135deg, ${lighten(hex, 0.35)} 0%, ${lighten(mid, 0.3)} 50%, ${lighten(end, 0.3)} 100%)`
    : `linear-gradient(135deg, ${hex} 0%, ${mid} 50%, ${end} 100%)`;

  return {
    primary,
    accent,
    gradient,
    foreground: isDark ? "#0a0a0a" : "#ffffff",
  };
}
