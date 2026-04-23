"use client";

import type { AnchorHTMLAttributes, ReactNode } from "react";
import { trackOutboundClick } from "@/lib/tracking/outbound";

interface OutboundLinkProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "target" | "rel"> {
  href: string;
  /** Item refNum */
  id: string;
  /** Seller ID */
  sid?: string;
  /** Seller name */
  sn?: string;
  /** Category */
  c?: string;
  /** Market code (defaults to 'GB') */
  mkt?: string;
  children: ReactNode;
}

/**
 * Outbound link — renders a standard `<a target="_blank">` and fires a
 * sendBeacon tracking event to `/api/nav/resolve` on click.
 *
 * Drop-in replacement for any external `<a>` tag pointing to
 * a seller product page on littlebiggy.net.
 */
export function OutboundLink({
  href,
  id,
  sid,
  sn,
  c,
  mkt = "GB",
  children,
  onClick,
  ...rest
}: OutboundLinkProps) {
  // Defensive rewrite: any stray littlebiggy.net links in legacy R2 data
  // should resolve to littlebiggy.org (the canonical domain). R2 aggregates
  // are patched too, but this keeps the frontend safe in case anything slips through.
  const normalizedHref = href.includes("littlebiggy.net")
    ? href.replace(/littlebiggy\.net/g, "littlebiggy.org")
    : href;

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    trackOutboundClick({
      id,
      url: normalizedHref,
      sid,
      sn,
      c,
      mkt,
    });
    onClick?.(e);
  };

  return (
    <a
      href={normalizedHref}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      {...rest}
    >
      {children}
    </a>
  );
}
