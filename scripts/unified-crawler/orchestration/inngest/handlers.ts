import { indexAllMarkets } from "./index_all_markets";
import { crawlItemsGlobal } from "./crawl_items_global";
import { shippingPruneMarket } from "./shipping_prune_market";
import { sellerAnalyticsMarket } from "./seller_analytics_market";

export const functions = [
  indexAllMarkets,
  crawlItemsGlobal,
  shippingPruneMarket,
  sellerAnalyticsMarket,
];
