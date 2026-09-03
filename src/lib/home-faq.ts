/**
 * Homepage FAQ question list, shared by the client accordion and the
 * server-emitted FAQPage markup so the two can never drift. Values are
 * message-key stems under `home.faq.{tab}.items.{key}`; array order renders.
 */

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
