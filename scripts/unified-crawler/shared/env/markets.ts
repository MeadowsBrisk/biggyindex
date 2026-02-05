import type { MarketCode } from "./loadEnv";

export const MARKET_CODES: MarketCode[] = ["GB", "DE", "FR", "IT", "PT", "ES"];

export const ACCEPT_LANGUAGE: Record<MarketCode, string> = {
  GB: "en-GB,en;q=0.9",
  DE: "de-DE,de;q=0.9",
  FR: "fr-FR,fr;q=0.9",
  IT: "it-IT,it;q=0.9",
  PT: "pt-PT,pt;q=0.9",
  ES: "es-ES,es;q=0.9",
};

export function listMarkets(configMarkets: MarketCode[]): MarketCode[] {
  return configMarkets;
}

export function marketStore(
  code: MarketCode,
  stores: Record<MarketCode | "shared", string>
): string {
  return stores[code];
}
