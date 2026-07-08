"use client";

import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { computeCustomAccentVars } from "@/lib/accent";
import {
  accentColorAtom,
  customAccentHexAtom,
  pauseGifsAtom,
} from "@/store/atoms";

/** Apply the custom-accent CSS variables. The values come from the SAME
 *  function the layout's pre-hydration boot script embeds (lib/accent.ts),
 *  so re-applying them after hydration is a visual no-op. */
function applyCustomAccent(hex: string, isDark: boolean) {
  const vars = computeCustomAccentVars(hex, isDark);
  const html = document.documentElement;
  html.style.setProperty("--primary", vars.primary);
  html.style.setProperty("--accent", vars.accent);
  html.style.setProperty("--accent-gradient", vars.gradient);
  html.style.setProperty("--primary-foreground", vars.foreground);
}

function clearCustomAccent() {
  const html = document.documentElement;
  html.style.removeProperty("--primary");
  html.style.removeProperty("--accent");
  html.style.removeProperty("--accent-gradient");
  html.style.removeProperty("--primary-foreground");
}

/** Sync pauseGifs atom to the DOM attribute used by CSS-level control. */
export function PauseGifsSync() {
  const pauseGifs = useAtomValue(pauseGifsAtom);

  useEffect(() => {
    if (pauseGifs) {
      document.documentElement.setAttribute("data-pause-gifs", "true");
    } else {
      document.documentElement.removeAttribute("data-pause-gifs");
    }
  }, [pauseGifs]);

  return null;
}

export function AccentSync() {
  const accent = useAtomValue(accentColorAtom);
  const customHex = useAtomValue(customAccentHexAtom);

  useEffect(() => {
    const html = document.documentElement;
    if (accent === "custom") {
      html.removeAttribute("data-accent");
      const isDark = html.getAttribute("data-theme") === "dark";
      applyCustomAccent(customHex, isDark);
    } else {
      clearCustomAccent();
      if (accent === "green") {
        html.removeAttribute("data-accent");
      } else {
        html.setAttribute("data-accent", accent);
      }
    }
  }, [accent, customHex]);

  useEffect(() => {
    if (accent !== "custom") return;
    const observer = new MutationObserver(() => {
      const isDark =
        document.documentElement.getAttribute("data-theme") === "dark";
      applyCustomAccent(customHex, isDark);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, [accent, customHex]);

  return null;
}
