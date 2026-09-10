/**
 * Homepage FAQ question list, shared by the client accordion and the
 * server-emitted FAQPage markup so the two can never drift. Values are
 * message-key stems under `home.faq.{tab}.items.{key}`; array order renders.
 */

import type { MarketCode } from "@/lib/market/market";

export const HOME_FAQ_TABS = ["about", "bitcoin"] as const;

export type HomeFaqTab = (typeof HOME_FAQ_TABS)[number];

export const HOME_FAQ_KEYS: Record<HomeFaqTab, readonly string[]> = {
  about: [
    "whatIs",
    "sellOrShip",
    "realSite",
    "dataSource",
    "refreshRate",
    "timestamps",
    "endorsements",
  ],
  bitcoin: [
    "payments",
    "buying",
    "wallet",
    "escrow",
    "mistakes",
    "clearnet",
    "legality",
  ],
};

/**
 * Entries appended to a tab on one market only.
 *
 * Questions that are specific enough to name a country ("Does Little Biggy
 * ship to Ireland?") earn their place on that market's edition and read as
 * noise on the others, so they are listed per market rather than written
 * vaguely enough to be globally true.
 */
const MARKET_FAQ_KEYS: Partial<
  Record<MarketCode, Partial<Record<HomeFaqTab, readonly string[]>>>
> = {
  IE: {
    about: ["shipsToIreland"],
    bitcoin: ["euroPrices"],
  },
};

/** Question keys for a tab on a given market, in render order. */
export function homeFaqKeys(
  tab: HomeFaqTab,
  market: MarketCode,
): readonly string[] {
  const extra = MARKET_FAQ_KEYS[market]?.[tab];
  return extra ? [...HOME_FAQ_KEYS[tab], ...extra] : HOME_FAQ_KEYS[tab];
}
