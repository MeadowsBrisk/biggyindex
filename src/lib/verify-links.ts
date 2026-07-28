/**
 * Verification link list — LittleBiggy's canonical / authenticity pages.
 *
 * Shared, framework-agnostic data. Deliberately a plain module with NO
 * `"use client"` directive: it is imported by the client-side header
 * surfaces (<VerifyDropdown>, <MobileVerifyLinks>) *and* by the
 * Server-Component <VerifyCard> on /littlebiggy-status. Adding a client
 * directive here would drag that page into the client graph.
 *
 * Two divergent lists of "which domains are the real Little Biggy" is
 * exactly the failure this feature exists to prevent — so there is one
 * list, here.
 */

import {
  Activity,
  Megaphone,
  Network,
  type ShieldCheck,
  Store,
} from "lucide-react";

export interface VerifyLink {
  /** Stable key + i18n key stem (namespace `header.verify`). */
  key: "canonBorg" | "mirrors" | "littlebiggy" | "status";
  href: string;
  /** Internal links use next/link and stay in-tab. */
  external: boolean;
  Icon: typeof ShieldCheck;
}

export const VERIFY_LINKS: readonly VerifyLink[] = [
  {
    key: "canonBorg",
    href: "https://littlebiggy.org/4791812",
    external: true,
    Icon: Megaphone,
  },
  {
    key: "mirrors",
    href: "https://littlebiggy.zone",
    external: true,
    Icon: Network,
  },
  {
    key: "littlebiggy",
    href: "https://littlebiggy.org",
    external: true,
    Icon: Store,
  },
  {
    key: "status",
    href: "/littlebiggy-status",
    external: false,
    Icon: Activity,
  },
];
