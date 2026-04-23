"use client";

import { useAtom } from "jotai";
import { Sun, Moon } from "lucide-react";
import { useEffect } from "react";
import { darkModeAtom } from "@/store/atoms";

export function ThemeToggle() {
  const [dark, setDark] = useAtom(darkModeAtom);

  useEffect(() => {
    // Disable transitions globally to prevent lag/waves when switching themes
    const css = document.createElement("style");
    css.appendChild(
      document.createTextNode(
        "*, *::before, *::after { transition: none !important; }",
      ),
    );
    document.head.appendChild(css);

    document.documentElement.setAttribute(
      "data-theme",
      dark ? "dark" : "light",
    );

    // Force reflow so the theme class change applies while transitions are off
    void getComputedStyle(css).opacity;

    // Re-enable transitions on next frame
    requestAnimationFrame(() => {
      document.head.removeChild(css);
    });
  }, [dark]);

  return (
    <button
      type="button"
      onClick={() => setDark(!dark)}
      className="rounded-lg p-2 text-muted transition-colors hover:bg-surface-hover hover:text-foreground cursor-pointer"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
