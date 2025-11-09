// Listing exclusion heuristics (tip jars, custom orders/listings)
// Ported from scripts/indexer/lib/exclusions/listingExclusions.js to TypeScript for the unified crawler.

export function isTipListing(name?: string | null, description?: string | null): boolean {
  const text = ` ${(name || "").toLowerCase()} ${(description || "").toLowerCase()} `;
  // Strong signals
  if (/\btip\s*jar\b/.test(text)) return true; // "tip jar", with optional spaces
  if (/\btipjar\b/.test(text)) return true; // joined form
  // Combo signals: references to balances/under/express along with tip
  if (/\btips?\b/.test(text) && /(underpaid|outstanding balance|express shipping|pay for shipping|short on|support|generous|partial\s+payment|part\s+payment|shipping\s*cost|extra\s+shipping|postage)/.test(text)) return true;
  // Explicit partial payment utility
  if (/(^|\W)tips?(\W|$)/.test(text) && /(partial\s+payment|part\s+payment)/.test(text)) return true; // e.g., "Tips and Partial payment"
  if (/(partial\s+payment|part\s+payment)/.test(text) && /(tip|tips|shipping|postage|balance|underpaid|unpaid|shipping\s*cost|extra\s+shipping)/.test(text)) return true;
  // Common phrasing: listing used to pay shipping/balance
  if (/pay for (express )?shipping/.test(text)) return true;
  // Hide postage/shipping upgrade utilities
  if (/(postage|shipping|delivery) upgrade/.test(text)) return true; // e.g., "postage upgrade", "shipping upgrade"
  if (/upgrade to (special|express) delivery/.test(text)) return true; // e.g., "upgrade to special delivery"

  // LB promo/service packages
  if (/\breferrer'?s?\b/.test(text) && /\bretirement\s+plan\b/.test(text)) return true; // Todd's Referrer Retirement Plan
  if (/passive\s+income/.test(text) && /(little\s*biggy|\blb\b)/.test(text)) return true; // passive income pitch tied to LB
  if (/\bstar\s+maker\b/.test(text)) return true; // Biggy Star Maker Package
  if (/visibility\s+on\s+lb/.test(text)) return true; // "visibility on LB" phrase
  if (/engaging\s+posts/.test(text) && /(little\s*biggy|\blb\b)/.test(text)) return true; // service/engagement pitch on LB

  return false;
}

export function isCustomListing(name?: string | null, description?: string | null): boolean {
  const title = String(name || '').toLowerCase().trim();
  const text = ` ${(name || '').toLowerCase()} ${(description || '').toLowerCase()} `;
  // Title-based explicit signals
  if (/\bcustom\s*(international\s*)?orders?\b/.test(title)) return true; // "Custom Orders", "CUSTOM INTERNATIONAL ORDERS"
  if (/\bcustom\s*listing(s)?\b/.test(title)) return true; // "Custom listing"
  if (/^custom\b/.test(title)) return true; // "Custom", "Custom #1"
  if (/^custom\s*#/.test(title)) return true; // explicit numbered customs
  if (/tips?/.test(title) && /custom/.test(title)) return true; // "Tips and Custom Buys"
  // Description-based explicit phrases (require 'custom order' or 'custom listing')
  if (/\bcustom\s*(international\s*)?orders?\b/.test(text)) return true;
  if (/\bcustom\s*listing(s)?\b/.test(text)) return true;
  if (/please\s+only\s+purchase[^.]*custom\s+order/.test(text)) return true;
  if (/this\s+listing\s+is\s+for\s+custom\s+orders?/.test(text)) return true;
  return false;
}
