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
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    trackOutboundClick({
      id,
      url: href,
      sid,
      sn,
      c,
      mkt,
    });
    onClick?.(e);
  };

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      {...rest}
    >
      {children}
    </a>
  );
}
