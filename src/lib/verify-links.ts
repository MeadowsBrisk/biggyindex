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
  /**
   * The address as users should SEE and memorise it — scheme-less, exactly
   * what they'd type. Requested by the LB operators: showing the raw URL is
   * what demonstrates the link is legit (a phishing clone can copy the label
   * "canon borg", but the visible address is the thing users can check).
   * Language-neutral, so it renders identically in all locales.
   */
  display: string;
  /** Internal links use next/link and stay in-tab. */
  external: boolean;
  Icon: typeof ShieldCheck;
}

export const VERIFY_LINKS: readonly VerifyLink[] = [
  {
    key: "canonBorg",
    href: "https://littlebiggy.org/4791812",
    display: "littlebiggy.org/4791812",
    external: true,
    Icon: Megaphone,
  },
  {
    key: "mirrors",
    href: "https://littlebiggy.zone",
    display: "littlebiggy.zone",
    external: true,
    Icon: Network,
  },
  {
    key: "littlebiggy",
    href: "https://littlebiggy.org",
    display: "littlebiggy.org",
    external: true,
    Icon: Store,
  },
  {
    key: "status",
    href: "/littlebiggy-status",
    display: "biggyindex.com/littlebiggy-status",
    external: false,
    Icon: Activity,
  },
];

/**
 * Our public source repository — surfaced in the footer (GitHub icon) as part
 * of the same legitimacy story: the LB operators require open source for
 * affiliation, and a security-conscious user can audit what this site does.
 */
export const GITHUB_REPO_URL =
  "https://github.com/MeadowsBrisk/biggyindex-frontend";
