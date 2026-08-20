import { ViewTransition } from "react";
import type { ReactNode } from "react";

/**
 * Cross-fades a page's content during client-side navigations.
 *
 * Wraps a page body in React's <ViewTransition> with the `page-xfade`
 * enter/exit class — the CSS lives in globals.css alongside the
 * cross-document `@view-transition` rule, so hard loads and client
 * navigations share one look. `default="none"` keeps the wrapper from
 * animating on unrelated updates (refetches, Suspense reveals).
 *
 * Server-compatible: render it directly from a page's return value.
 * Apply per page (not in a layout — layouts persist across navigations,
 * so enter/exit would never fire there).
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter="page-xfade" exit="page-xfade" default="none">
      {children}
    </ViewTransition>
  );
}
