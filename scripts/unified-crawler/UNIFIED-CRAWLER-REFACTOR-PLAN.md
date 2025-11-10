# Unified Multi-Market Crawler & Indexer Refactor Plan

**Status:** DRAFT (v1.3 – 2025-10-25)  
**Purpose:** Consolidate three separate scrapers (indexer, item crawler, seller crawler) into a unified, market-aware data collection system that supports multiple geographic regions with minimal code duplication.

**📘 Companion Documents:**
- [DEDUPLICATION-STRATEGY.md](./DEDUPLICATION-STRATEGY.md) – Detailed explanation of cross-market deduplication approach
- [netlify.toml](./netlify.toml) and `netlify/functions/` – Netlify-only orchestration (replaces Inngest)
- [docs/INNGEST-ORCHESTRATION-PLAN.md](./docs/INNGEST-ORCHESTRATION-PLAN.md) – Deprecated; retained for historical context only

---

## Table of Contents
1. [Executive Summary](#1-executive-summary)
2. [Current Architecture Analysis](#2-current-architecture-analysis)
3. [Multi-Market Requirements](#3-multi-market-requirements)
4. [Unified Architecture Design](#4-unified-architecture-design)
5. [Data Retention & Pruning Strategy](#5-data-retention--pruning-strategy)
6. [Migration Path & Phasing](#6-migration-path--phasing)
7. [Environment Configuration](#7-environment-configuration)
8. [Persistence Layer Design](#8-persistence-layer-design)
9. [Front-End Integration](#9-front-end-integration)
10. [Testing Strategy](#10-testing-strategy)
11. [Performance & Optimization](#11-performance--optimization)
12. [Deployment Architecture](#12-deployment-architecture)

---

## 1. Executive Summary

### Current State
- **Three separate scripts**: `index-items.js` (indexer), `crawl-items.js` (item crawler), `crawl-sellers.js` (seller crawler)
- **Single market**: Hardcoded GB/UK market (`shipsTo=GB`)
- **Separate development**: Built at different times with different patterns
- **Code duplication**: Cookie management, HTTP clients, persistence logic repeated across scripts
- **No pruning**: Items/sellers persist indefinitely, causing file bloat
- **No deduplication**: Would cause massive redundancy if naively replicated per market

### Target State
- **Unified crawler system**: Single orchestration layer with market-aware modules
- **Multi-market support**: FR, PT, DE, IT (extensible for future markets)
- **Smart deduplication**: Shared core data (descriptions, reviews) crawled once globally, referenced by all markets
- **Market-specific overlays**: Lightweight shipping/availability data per market
- **Shared core**: Reusable authentication, HTTP, persistence, and state management
- **Data lifecycle**: Automatic pruning of stale items/sellers (configurable retention periods)
- **Clean codebase**: Professional, maintainable, well-documented modules
- **Efficient storage**: ~70% savings by avoiding duplication of item details across markets

### Critical Insight: Cross-Market Item Sharing
**Most items appear in multiple markets** (sellers ship to GB, DE, FR), but with different shipping options. The unified architecture uses:

1. **Shared core store** (`site-index-shared`):
   - Full item details (description, reviews, share links) crawled **once globally**
   - Shared seller data (manifesto, seller reviews)
   - ~15KB per item (expensive auth-required operations)

2. **Market overlay stores** (`site-index-gb`, `site-index-de`, `site-index-fr`):
   - Lightweight item references (~2KB per item)
   - Market-specific shipping data (~0.5KB per item)
   - Market-specific availability (item present/absent)
   - Independent pruning per market

**Example Storage**:
- 5000 items, 80% shared across 3 markets
- **Without dedup**: 15KB × 5000 × 3 = 225MB
- **With dedup**: (15KB × 5000) + (2.5KB × 5000 × 3) = 112.5MB (**50% savings**)
- With 80% overlap: **~70% savings**

### Key Benefits
1. **Maintainability**: Single source of truth for core logic; easier to debug and extend
2. **Scalability**: Add new markets by configuration, not code duplication
3. **Efficiency**: 
   - Shared session/cookies across all crawl stages
   - Deduped expensive operations (auth-required crawling)
   - Optimized concurrency (one item crawled globally, benefits all markets)
4. **Storage efficiency**: 50-70% reduction in blob storage usage
5. **Data hygiene**: Automatic cleanup prevents indefinite dataset growth
6. **User experience**: Faster frontend loads (lightweight market indexes), lazy-loaded details
7. **Type safety**: Optional TypeScript migration path (future)

---

## 2. Current Architecture Analysis

### 2.0 Visual Architecture Comparison

#### Current (Duplicated per Market)
```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  GB Indexer  │ │  DE Indexer  │ │  FR Indexer  │
│  GB Items    │ │  DE Items    │ │  FR Items    │
│  GB Sellers  │ │  DE Sellers  │ │  FR Sellers  │
└──────┬───────┘ └──────┬───────┘ └──────┬───────┘
       │                │                │
       ▼                ▼                ▼
  (separate        (separate        (separate
   crawlers)        crawlers)        crawlers)
       │                │                │
       ▼                ▼                ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Blob: GB     │ │ Blob: DE     │ │ Blob: FR     │
│ 5000 items   │ │ 4000 items   │ │ 3500 items   │
│ 15KB each    │ │ 15KB each    │ │ 15KB each    │
│ = 75MB       │ │ = 60MB       │ │ = 52MB       │
└──────────────┘ └──────────────┘ └──────────────┘
Total: 187MB (with 80% overlap = massive waste!)
```

#### Proposed (Unified with Dedup)
```
┌─────────────────────────────────────────────────┐
│         Unified Crawler Orchestrator            │
└─────────────────────────────────────────────────┘
              │
    ┌─────────┼─────────┐
    ▼         ▼         ▼
┌────────┐┌────────┐┌────────┐
│GB Index││DE Index││FR Index│ (lightweight, market-specific)
└────┬───┘└───┬────┘└───┬────┘
     │        │         │
     └────────┼─────────┘
              ▼
    ┌──────────────────┐
    │  Deduped Work    │ (aggregate unique items)
    │  5000 items      │
    └────────┬─────────┘
             ▼
    ┌──────────────────┐
    │  Global Crawler  │ (shared: auth, crawl, parse)
    └────────┬─────────┘
             │
    ┌────────┼────────┐
    ▼        ▼        ▼
┌─────────────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ Shared Core     │ │  GB      │ │  DE      │ │  FR      │
│ 5000 items      │ │ Market   │ │ Market   │ │ Market   │
│ 15KB each       │ │ Overlay  │ │ Overlay  │ │ Overlay  │
│ = 75MB          │ │ 2.5KB/ea │ │ 2.5KB/ea │ │ 2.5KB/ea │
│                 │ │ = 12.5MB │ │ = 10MB   │ │ = 8.75MB │
└─────────────────┘ └──────────┘ └──────────┘ └──────────┘
Total: 106.25MB (~43% savings, more with higher overlap!)
```

---

### 2.1 Existing Scripts Breakdown

#### Indexer (`scripts/indexer/index-items.js`)
**Purpose**: Foundation data collection from public API  
**Current Responsibilities**:
- Fetch items from `/core/api/items-wall/?shipsTo=GB`
- Normalize fields (name, description, variants, pricing)
- Categorize items via keyword/heuristic pipeline
- Build seller aggregates from item data
- Embed crawler-supplied data (share links, shipping)
- Write outputs: `indexed_items.json`, `sellers.json`, `manifest.json`, per-category chunks

**Key Modules**:
```
lib/
  env/loadEnv.js              - Environment loader
  fetch/fetchItems.js         - HTTP fetching
  categorize/pipeline.js      - Classification rules
  pricing/variants.js         - Price normalization
  aggregation/               - Seller building, manifests, recent items
  persistence/               - Blob/FS writing
```

**Hardcoded Market Dependencies**:
- Endpoints array has `?shipsTo=GB`
- URLs module: `buildSearchUrl()` uses `shipsTo=GB`
- Accept-Language header: `en-GB`

#### Item Crawler (`scripts/item-crawler/crawl-items.js`)
**Purpose**: Enrich items with auth-required details  
**Current Responsibilities**:
- Login with LB credentials
- Fetch per-item HTML pages
- Extract shipping options (applied location filter: `GB`)
- Extract full descriptions
- Fetch reviews (API-based, paginated)
- Generate share/referral links
- Write per-item JSON + aggregated supplement

**Key Modules**:
```
auth/login.js               - Cookie jar + multi-host login
fetch/                      - Item pages, reviews API, share forms
parse/                      - Shipping HTML, description, reviews
persistence/               - Per-item JSON, blobs, state
util/                       - Logging, delays, differential crawl logic
```

**Hardcoded Market Dependencies**:
- `CRAWLER_SHIPS_TO` defaults to `GB`
- Location filter form POST uses `shipsTo` value

#### Seller Crawler (`scripts/seller-crawler/crawl-sellers.js`)
**Purpose**: Enrich sellers with page-level details  
**Current Responsibilities**:
- Login (reuses item crawler cookie jar)
- Fetch seller pages (manifesto, metadata)
- Fetch seller reviews summary
- Generate seller share links
- Compute leaderboards (top/bottom sellers)
- Write per-seller JSON + analytics aggregates

**Key Modules**:
```
fetch/                      - Seller pages, reviews API, share forms
parse/                      - Manifesto extraction, seller metadata
aggregation/               - Leaderboards, analytics, recent activity
persistence/               - Per-seller JSON, blobs
```

**Hardcoded Market Dependencies**:
- Loads `sellers.json` from indexer (which is GB-only currently)
- No explicit market parameter, but implicitly tied to indexer's market

### 2.2 Shared Patterns & Duplication

**Duplicated Across Scripts**:
- Cookie jar loading/saving (filesystem + blob fallback)
- HTTP client creation with retry/backoff
- Login flow with multi-host fallback
- Blob store initialization
- State management (resume/skip logic)
- Delay/jitter timing
- Logging infrastructure

**Inconsistencies**:
- Different env var naming conventions (`CRAWLER_*` vs `SELLER_CRAWLER_*`)
- Different persistence strategies (item crawler has migration logic, seller crawler doesn't)
- Different state structures (items use `seen.json`, sellers use separate state)

### 2.3 Current Data Flow
```
┌─────────────┐
│   Indexer   │ (public API, no auth)
│  GB market  │
└──────┬──────┘
       │ writes: indexed_items.json, sellers.json
       ▼
┌─────────────┐
│Item Crawler │ (auth required)
│  shipsTo=GB │
└──────┬──────┘
       │ writes: item-crawler/*.json, index-supplement.js
       │ (indexer re-reads supplement on next run)
       ▼
┌─────────────┐
│Seller Crawlr│ (auth required)
│  reads: GB  │
│  sellers    │
└──────┬──────┘
       │ writes: seller-crawler/*.json, analytics
       ▼
  Front-end (Next.js)
  loads all JSON artifacts
```

---

## 3. Multi-Market Requirements

### 3.1 Supported Markets (Initial)
| Market Code | Region | Currency | Language | Domain | Notes |
|-------------|--------|----------|----------|--------|-------|
| GB | United Kingdom | GBP | en-GB | lbindex.vip (current) | Existing deployment |
| FR | France | EUR | fr-FR | lbindex.fr | New |
| PT | Portugal | EUR | pt-PT | lbindex.pt | New |
| DE | Germany | EUR | de-DE | lbindex.de | New |
| IT | Italy | EUR | it-IT | lbindex.it | New |

Notes:
- All EU markets above display prices in EUR and use their own locale for formatting; GB remains GBP.
- Additional markets (EU aggregate, US) can be added later but are out of scope for the initial rollout.

### 3.2 Market-Specific Data Variations

**Critical Insight**: Most items are **shared across markets** (same sellers, same products), but with market-specific variations in shipping availability/cost.

**Per Market** (Variable):
- **Shipping options**: Different carriers, costs, speed per market
- **Shipping availability**: Some sellers may not ship to certain markets (item present in GB, absent in FR)
- **Currency display**: Same price, different display format (though LB may use same currency)

**Shared Across Markets** (Deduplicated):
- **Item core data**: name, description, images, variants, base pricing
- **Reviews**: Same reviews regardless of market
- **Seller data**: manifesto, seller reviews, seller metadata
- **Share links**: Market-agnostic item/seller references
- **Categorization**: Same taxonomy rules
- **Full item details**: Descriptions, review snapshots (crawled once, shared)

**Implication**: We should use a **shared core dataset** with **market-specific overlays** rather than fully independent datasets per market.

### 3.3 Front-End Requirements per Market
Each market will have a separate Next.js deployment:
- Domain-specific (`lbindex.de`, `lbindex.fr`, etc.)
- Market-aware configuration:
  - Currency display (EUR vs GBP)
  - Locale for date/number formatting
  - Language strings (i18n)
  - Shipping info display
- Data loading: Fetch from market-specific Blob store or API route

### 3.4 Blob Storage Strategy

**REVISED STRATEGY – Hybrid: Shared Core + Market Overlays**

Since most items are identical across markets (only shipping differs), we'll use:

**Option C – Shared Core with Market Overlays** (RECOMMENDED):

```
# Shared blob store (cross-market)
site-index-shared/
  items/
    core/
      <itemId>.json           # Full item details (description, reviews) - crawled once
    sellers/
      <sellerId>.json         # Seller details (manifesto, reviews) - crawled once
  shared/
    cookies/jar.json          # Shared auth session
    
# Per-market blob stores (lightweight overlays)
site-index-gb/
  indexed_items.json          # Items available in GB (references to shared core)
  sellers.json                # Sellers shipping to GB
  data/
    manifest.json             # GB-specific category counts
    items-flower.json         # Item IDs + GB-specific fields (shipping)
  market-shipping/
    <itemId>.json             # GB shipping options ONLY (lightweight)
  state.json                  # GB market state (seen timestamps)

site-index-de/
  indexed_items.json          # Items available in DE
  sellers.json                # Sellers shipping to DE
  data/
    manifest.json             # DE-specific category counts
  market-shipping/
    <itemId>.json             # DE shipping options ONLY
  state.json                  # DE market state

site-index-fr/
  # ... same structure

site-index-pt/
  # ... same structure (Portugal)

site-index-it/
  # ... same structure (Italy)
```

**Benefits**:
- ✅ **Avoid duplication**: Item descriptions, reviews crawled once (expensive auth operations)
- ✅ **Market isolation**: Each market has independent outputs for frontend
- ✅ **Efficient storage**: Shared items = ~80% storage savings across 3 markets
- ✅ **Independent pruning**: Can prune GB without affecting DE/FR
- ✅ **Clear separation**: Easy to see what's market-specific vs. shared

**How It Works**:
1. **Item Crawler**: Writes full item details to `site-index-shared/items/core/<itemId>.json` (once per item globally)
2. **Seller Crawler**: Writes seller details to `site-index-shared/sellers/<sellerId>.json` (once per seller globally)
3. **Indexer per Market**: 
   - Fetches items for specific market (`?shipsTo=GB`)
   - Writes `indexed_items.json` with references: `{ id, refNum, ...lightweightFields, _coreDataKey: 'shared/items/core/12345.json' }`
   - Writes market-specific shipping to `market-shipping/<itemId>.json`
4. **Frontend**: Loads market index, lazy-fetches core details from shared store when modal opened

**Alternative Considered**:
- **Option A** (Separate Stores): Too much duplication (~3x storage for mostly identical data)
- **Option B** (Single Store with Prefixes): Risk of cross-market leakage, harder pruning

**Decision**: Hybrid approach balances efficiency with safety.

---

## 4. Unified Architecture Design

### 4.0.1 Shipping & Location Filter Optimization (multi-market)

Problem: The site exposes market shipping via a location filter (cookie-backed) and not a simple query param. Doing this per-country naïvely (and per language) would be slow.

Practical solution (keeps current modules and minimizes overhead):

- Dedicated session pool per market
  - Maintain a small pool of cookie jars per market (size = crawler parallelism for that market, e.g., 3–6). Reuse these across all item requests in that market.
  - On pool init, call the existing `setLocationFilter` once per jar (already implemented in item crawler) to pin the market (GB/DE/FR) and avoid repeating the POST for every item.
  - Rotate jars per request to spread load; refresh a jar only when an LF cookie nears expiry.

- Language vs location
  - Shipping visibility depends on the location filter, not the UI language. We don’t need to cycle through languages to get shipping.
  - Keep `Accept-Language` stable (e.g., market locale), but don’t multiply runs by languages—single run per market is enough. Only switch language if a specific parse needs it (rare).

- Partial HTML streaming + early abort
  - Keep using partial streaming with byte caps and early-abort markers (already in item crawler). It drastically reduces bytes fetched per item page.

- Shipping refresh policy (cut work by 80%+)
  - Refresh market shipping on a slower cadence than reviews: every 14 days OR when item signature/variants change OR when we detect a market-availability flip.
  - Track `lastShippingCrawl` per item per market in market/global state and skip otherwise.

- Embed shipping USD summary in indexes
  - The indexer writes a compact shipping summary per item into `indexed_items.json` for each market: `{ minUSD?, maxUSD?, free?, cnt? }`.
  - The full set of options remains in `market-shipping/<id>.json`; the summary is derived from that document or API hints during index.

- Opportunistic extraction during index
  - When API responses include shipping hints, write the lightweight `market-shipping/<id>.json` immediately (fast path), and defer full HTML-based extraction to the slow path only if needed.

- Backoff + pooling limits
  - Per-market concurrency caps (e.g., GB: 4, DE/FR: 3) with jitter and exponential backoff on 429/5xx.

Net effect: One LF POST per jar (per market) at start, then cheap GETs with partial HTML. No multiplication by languages; one pass per market.

### 4.0.2 Indexing across markets (`?shipsTo`)

- Sequential markets, shared process
  - Run the public API fetch for each market sequentially in the same process/function invocation (GB → DE → FR), building three lightweight indexes quickly.

- Conditional fetch (if supported)
  - If the API supports `ETag`/`If-None-Match` or `If-Modified-Since`, send conditional headers to avoid re-downloading unchanged payloads; otherwise hash the response to suppress unnecessary writes.

- Hash & compare
  - Compute a stable hash of `message.items` per market; if unchanged from prior run, skip downstream work for that market except minimal freshness tasks.

- Rate safety
  - Stagger market API calls by a small delay (e.g., 1–2 seconds) to avoid burst limits.

### 4.0.3 Pricing & Currency Strategy (frontend‑driven FX)

Source of truth:
- Original site prices are exposed in USD; current site converts to GBP/BTC on the frontend.
- To ensure prices are always up to date for each locale, the frontend will compute market display prices at runtime from USD using the latest FX rates.

Strategy (indexer responsibilities):
- Store canonical price fields in shared core and pass through to indexes as USD (and optionally BTC) using compact keys:
  - `usd`: number (required)
  - Optional `btc`: number when computed during crawl
  - Optional `priceOriginal`: `{ amount, currency }` for debugging in shared core only (not included in market indexes)
- Do NOT precompute per‑market fiat display prices in the index; keep indexes currency‑agnostic (USD/BTC only).

Strategy (frontend responsibilities):
- Fetch small FX rates at page load (or during ISR/SSG) and convert USD amounts to the market currency.
- Rates source options:
  - Lightweight server function or edge endpoint that returns a cached rates JSON (updated hourly/daily), or
  - Direct client fetch from a public FX API.
- Rounding rules: round to nearest 0.01 for fiat; if BTC displayed, round to 1e-6.

Output contract:
- Market index JSON contains USD (and optional BTC) price fields; the frontend computes and formats local currency per market.
- Shared core retains the same canonical price fields for deterministic rebuilds.

### 4.0 Cross-Market Deduplication Strategy

#### 4.0.0 Refresh Policy (full vs reviews-only)

To balance freshness and cost, use a tiered change detection policy:

- Full crawl when:
  - Item is new (no shared core exists), or
  - Item signature changed (variants/core fields differ), or
  - Last full crawl is older than 14 days (biweekly full refresh window)
- Reviews-only refresh when:
  - Shared core exists, signature unchanged, and last full crawl is within 14 days
  - Frequency: every run (default cadence ~4h); planner may cap if approaching time budget
- Skip when none of the above apply

Notes:
- Reviews-only refresh updates reviews fields without re-fetching description/share unless signature changed or the 14-day window elapses.
- The mode decision is logged and included in run-meta counts for observability.

**Core Principle**: Expensive operations (auth-required crawling) happen once globally; lightweight operations (indexing, shipping extraction) happen per market.

#### Deduplication Workflow

```
┌─────────────────────────────────────────────────────────────┐
│                   Crawler Orchestrator                      │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
         ┌─────────┐    ┌─────────┐    ┌─────────┐
         │ GB Index│    │ DE Index│    │ FR Index│
         │ (daily) │    │ (daily) │    │ (daily) │
         └────┬────┘    └────┬────┘    └────┬────┘
              │              │              │
              └──────┬───────┴──────┬───────┘
                     ▼              ▼
         Market-specific      Market-specific
         indexed_items.json   shipping extraction
              (lightweight)        (per market)
                     │
                     ▼
         ┌────────────────────────────┐
         │  Dedupe Item Crawler Work  │ ← Aggregates ALL markets
         └────────────────────────────┘
                     │
         Items needing full crawl (global):
         - New items (not in shared core)
         - Changed items (signature mismatch)
         - Stale reviews (>4h old)
                     │
                     ▼
         ┌────────────────────────────┐
         │   Item Crawler (Global)    │
         │  - HTML fetch              │
         │  - Reviews API             │
         │  - Share link              │
         │  - Description extraction  │
         └────────────────────────────┘
                     │
                     ▼
         site-index-shared/items/core/<id>.json
         (Referenced by all markets)
```

#### Example: Item Lifecycle Across Markets

**Day 1 (GB launch)**:
```
1. GB indexer runs → finds item 12345
2. Item crawler checks: not in shared core → FULL CRAWL
3. Writes: site-index-shared/items/core/12345.json
4. GB indexer references: { id: 12345, _coreRef: '...' }
5. GB shipping extractor writes: site-index-gb/market-shipping/12345.json
```

**Day 30 (DE launch)**:
```
1. DE indexer runs → finds item 12345 (same seller ships to DE)
2. Item crawler checks: EXISTS in shared core → schedule REVIEWS-ONLY as part of regular cadence
3. DE indexer references: { id: 12345, _coreRef: '...' } (same as GB)
4. DE shipping extractor writes: site-index-de/market-shipping/12345.json (different costs)
```

**Day 31 (periodic refresh)**:
```
1. GB indexer runs → item 12345 still present
2. Item crawler checks: EXISTS, signature unchanged, lastFullCrawl <14d → REVIEWS-ONLY REFRESH (as per cadence)
3. Updates: site-index-shared/items/core/12345.json (reviews only)
4. Both GB and DE frontends see updated reviews (shared core)
```

**Day 400 (GB pruning)**:
```
1. GB indexer runs → item 12345 not found (seller stopped shipping to GB)
2. GB market state: lastSeen > 365 days → ARCHIVE
3. Deletes: site-index-gb/market-shipping/12345.json
4. Shared core: DE still references → KEEP
```

#### Deduplication Decision Logic

```javascript
// core/orchestration/dedupeWorkList.js
function buildGlobalWorkList({ allMarkets, globalState }) {
  const workList = new Map(); // itemId -> { markets, needsCrawl, reason }
  
  // Aggregate items from all markets
  for (const market of allMarkets) {
    const marketItems = loadMarketIndex(market);
    
    for (const item of marketItems) {
      if (!workList.has(item.id)) {
        workList.set(item.id, { markets: [], needsCrawl: false, reason: null });
      }
      
      const entry = workList.get(item.id);
      entry.markets.push(market.code);
      
      // Decide if needs crawling (only check once per item, not per market)
      if (!entry.needsCrawl) {
        const globalMeta = globalState.items[item.id];
        
        if (!globalMeta || !globalMeta.coreDataExists) {
          entry.needsCrawl = true;
          entry.reason = 'full:new';
        } else if (item.signature !== globalMeta.signature) {
          entry.needsCrawl = true;
          entry.reason = 'full:changed';
        } else if (isOlderThanDays(globalMeta.lastFullCrawl, 14)) {
          entry.needsCrawl = true;
          entry.reason = 'full:stale-14d';
        } else {
          // Signature unchanged and within 14d window → schedule reviews-only
          entry.needsCrawl = true;
          entry.reason = 'reviews-only:scheduled';
        }
      }
    }
  }
  
  // Filter to only items needing work
  const crawlList = Array.from(workList.entries())
    .filter(([id, entry]) => entry.needsCrawl)
    .map(([id, entry]) => ({ id, ...entry }));
  
  return { crawlList, totalItems: workList.size };
}
```

#### Shipping Extraction Per Market

Since shipping is market-specific but can be extracted from the public index data (when available):

**Option A – Extract During Index Stage** (RECOMMENDED for simple cases):
```javascript
// During indexing, extract shipping from API response if present
// Write immediately to market-shipping/<id>.json
// No separate crawl needed
```

**Option B – Dedicated Shipping Crawl** (if requires auth/location filter):
```javascript
// Item crawler, after main crawl:
for (const market of item.markets) {
  if (!hasRecentShipping(item.id, market)) {
    await fetchShippingForMarket(item.id, market);
    await marketStore.set(`market-shipping/${item.id}.json`, ...);
  }
}
```

Current implementation uses Option B (location filter POST), so will continue with that approach but dedupe per-market.

---

### 4.1 High-Level Module Structure
```
scripts/
  unified-crawler/
    cli.js                      # Main CLI entry (orchestrates all stages)
    config/
      markets.js                # Market definitions (codes, endpoints, currencies)
      stages.js                 # Stage definitions (index, items, sellers)
    core/
      auth/
        login.js                # Shared login (multi-host, cookie jar)
      http/
        client.js               # Axios client factory with retry
      persistence/
        blobStore.js            # Blob abstraction (init, read, write)
        cookieStore.js          # Cookie jar persistence (blob-first)
        stateStore.js           # Crawl state (seen items/sellers, timestamps)
      util/
        logger.js               # Structured logging
        delay.js                # Timing helpers
        pruning.js              # Data retention/cleanup logic
    stages/
      index/
        fetchItems.js           # Public API fetching
        normalize.js            # Item normalization
        categorize.js           # Classification (reuse existing pipeline)
        buildSellers.js         # Seller aggregation
      items/
        fetchItemPage.js        # HTML fetching
        extractDetails.js       # Shipping, description parsing
        fetchReviews.js         # Reviews API
        generateShare.js        # Share link POST
      sellers/
        fetchSellerPage.js      # Seller HTML
        extractManifesto.js     # Manifesto parsing
        fetchReviews.js         # Seller reviews API
        analytics.js            # Leaderboards, stats
    orchestration/
      runStage.js               # Generic stage runner (concurrency, error handling)
      differential.js           # Decide what to crawl (full/partial/skip)
      pruning.js                # Post-crawl cleanup (remove stale entries)
    tests/
      unit/                     # Per-module tests
      integration/              # Full pipeline tests per market
      snapshots/                # Output validation
```

### 4.2 Execution Flow (Unified)
```
CLI invoked: node scripts/unified-crawler/cli.js --market=DE --stages=all

1. Load market config (DE: endpoint, currency, locale)
2. Initialize persistence (market store: site-index-de, shared store: site-index-shared)
3. Load shared state (seen items/sellers globally + market-specific timestamps)
4. Authenticate (shared cookie jar across all markets)

Stage 1 - Index (Market-Specific):
  - Fetch items from API (shipsTo=DE)
  - Normalize variants, pricing
  - Categorize items
  - Cross-reference with shared core: check if item already crawled globally
  - Build market-specific seller aggregates (only sellers shipping to DE)
  - Write outputs to market store:
    - indexed_items.json (lightweight, references shared core)
    - sellers.json (market-filtered)
    - manifest.json (DE-specific counts)
    - market-shipping/<itemId>.json (DE shipping options extracted from indexed data)
  - Update market state (lastSeen timestamps for DE)

Stage 2 - Items (Global, Deduped):
  - Aggregate work list from ALL active markets (GB + DE + FR)
  - Dedupe: Only crawl items not yet in shared core OR needing refresh
  - Concurrent fetch (HTML, reviews, share - MARKET-AGNOSTIC operations)
  - Write to shared store: site-index-shared/items/core/<itemId>.json
  - Update global state (lastFullCrawl timestamps)
  
  Per-Market Shipping Enrichment:
  - For each market where item appears:
    - Apply market location filter (GB, DE, FR)
    - Extract shipping options
    - Write to market store: site-index-{market}/market-shipping/<itemId>.json

Stage 3 - Sellers (Global, Deduped):
  - Aggregate seller list from ALL active markets
  - Dedupe: Only crawl sellers not yet in shared core OR needing refresh
  - Concurrent fetch (page, reviews, share, manifesto - MARKET-AGNOSTIC)
  - Write to shared store: site-index-shared/sellers/<sellerId>.json
  - Compute per-market analytics (using market-specific item subsets)
  - Write analytics to market stores

5. Pruning pass (Per-Market):
   - Each market independently prunes based on lastSeen in that market
   - Shared core items pruned only if not referenced by ANY active market

6. Write final state snapshot (market + global)
7. Save shared cookie jar (for next run, any market)
8. Generate run metadata report
```

### 4.3 Market Configuration Schema
```javascript
// config/markets.js
const MARKETS = {
  GB: {
    code: 'GB',
    name: 'United Kingdom',
    currency: 'GBP',
    locale: 'en-GB',
    timezone: 'Europe/London',
    endpoints: [
      'https://littlebiggy.net/core/api/items-wall/?shipsTo=GB',
      'https://www.littlebiggy.net/core/api/items-wall/?shipsTo=GB'
    ],
    acceptLanguage: 'en-GB,en;q=0.9',
    blobStore: 'site-index-gb',
    blobPrefix: '',
    frontendUrl: 'https://lbindex.vip',
    retentionDays: 365, // items not seen for 1 year are pruned
  },
  DE: {
    code: 'DE',
    name: 'Germany',
    currency: 'EUR',
    locale: 'de-DE',
    timezone: 'Europe/Berlin',
    endpoints: [
      'https://littlebiggy.net/core/api/items-wall/?shipsTo=DE',
      'https://www.littlebiggy.net/core/api/items-wall/?shipsTo=DE'
    ],
    acceptLanguage: 'de-DE,de;q=0.9,en;q=0.8',
    blobStore: 'site-index-de',
    blobPrefix: '',
    frontendUrl: 'https://lbindex.de',
    retentionDays: 365,
  },
  FR: {
    code: 'FR',
    name: 'France',
    currency: 'EUR',
    locale: 'fr-FR',
    timezone: 'Europe/Paris',
    endpoints: [
      'https://littlebiggy.net/core/api/items-wall/?shipsTo=FR',
      'https://www.littlebiggy.net/core/api/items-wall/?shipsTo=FR'
    ],
    acceptLanguage: 'fr-FR,fr;q=0.9,en;q=0.8',
    blobStore: 'site-index-fr',
    blobPrefix: '',
    frontendUrl: 'https://lbindex.fr',
    retentionDays: 365,
  },
  PT: {
    code: 'PT',
    name: 'Portugal',
    currency: 'EUR',
    locale: 'pt-PT',
    timezone: 'Europe/Lisbon',
    endpoints: [
      'https://littlebiggy.net/core/api/items-wall/?shipsTo=PT',
      'https://www.littlebiggy.net/core/api/items-wall/?shipsTo=PT'
    ],
    acceptLanguage: 'pt-PT,pt;q=0.9,en;q=0.8',
    blobStore: 'site-index-pt',
    blobPrefix: '',
    frontendUrl: 'https://lbindex.pt',
    retentionDays: 365,
  },
  IT: {
    code: 'IT',
    name: 'Italy',
    currency: 'EUR',
    locale: 'it-IT',
    timezone: 'Europe/Rome',
    endpoints: [
      'https://littlebiggy.net/core/api/items-wall/?shipsTo=IT',
      'https://www.littlebiggy.net/core/api/items-wall/?shipsTo=IT'
    ],
    acceptLanguage: 'it-IT,it;q=0.9,en;q=0.8',
    blobStore: 'site-index-it',
    blobPrefix: '',
    frontendUrl: 'https://lbindex.it',
    retentionDays: 365,
  },
  // EU: { ... } // Aggregate market (optional)
};

function getMarket(code) {
  const market = MARKETS[code.toUpperCase()];
  if (!market) throw new Error(`Unknown market: ${code}`);
  return market;
}

module.exports = { MARKETS, getMarket };
```

### 4.4 Shared Core Modules

#### Authentication Module (`core/auth/login.js`)
```javascript
// Consolidates login logic from all three scripts
async function login({ username, password, jar, timeout, logger }) {
  // Multi-host login with fallback (littlebiggy.net, www.littlebiggy.net)
  // Returns authenticated axios client + jar
  // Reusable across all stages
}
```

#### HTTP Client Factory (`core/http/client.js`)
```javascript
function createHttpClient({ jar, timeout, maxRetries, logger, market }) {
  // Create axios instance with:
  // - Cookie jar
  // - Retry logic (exponential backoff)
  // - Market-aware headers (Accept-Language)
  // - Timeout configuration
  // - Request/response interceptors for logging
}
```

#### Blob Store Abstraction (`core/persistence/blobStore.js`)
```javascript
// Market-aware blob store wrapper
class BlobStore {
  constructor(marketCode) {
    this.marketCode = marketCode;
    this.storeName = MARKETS[marketCode].blobStore;
  }
  
  async get(key) { /* ... */ }
  async set(key, value) { /* ... */ }
  async delete(key) { /* ... */ }
  async list(prefix) { /* ... */ }
  
  // Batch operations for efficiency
  async getMany(keys) { /* ... */ }
  async setMany(entries) { /* ... */ }
}
```

#### State Store (`core/persistence/stateStore.js`)
```javascript
// Unified state tracking across all stages
// Structure:
{
  market: 'DE',
  lastIndexRun: '2025-10-12T10:30:00Z',
  items: {
    '<itemId>': {
      firstSeen: '2025-09-01T12:00:00Z',
      lastSeen: '2025-10-12T10:30:00Z',
      lastFullCrawl: '2025-10-10T08:00:00Z',
      lastReviewsRefresh: '2025-10-12T09:00:00Z',
      signature: 'abc123...', // detect changes
      archived: false
    }
  },
  sellers: {
    '<sellerId>': {
      firstSeen: '2025-09-01T12:00:00Z',
      lastSeen: '2025-10-12T10:30:00Z',
      lastFullCrawl: '2025-10-10T08:00:00Z',
      archived: false
    }
  }
}
```

---

## 5. Data Retention & Pruning Strategy

### 5.1 Problem Statement
Current scripts indefinitely retain all items/sellers ever seen, causing:
- Exponentially growing `indexed_items.json` (slower loads)
- Stale/delisted items polluting search results
- Wasted storage (Netlify Blobs, bandwidth)

### 5.2 Retention Policy (Configurable per Market)

**Default Retention**: 365 days (1 year)

**Item Lifecycle States**:
1. **Active**: Seen in last run; included in public outputs
2. **Stale**: Not seen in recent runs but within retention window; kept in state, excluded from public outputs
3. **Archived**: Not seen beyond retention period; moved to archive or deleted

**Seller Lifecycle States**:
1. **Active**: Has active items or seen in seller crawl recently
2. **Stale**: No active items but within retention window
3. **Archived**: No items seen beyond retention period

### 5.3 Pruning Implementation

#### When to Prune
Run pruning pass **after** all crawl stages complete:
```
Index → Items → Sellers → Pruning → Write Final State
```

#### Pruning Logic (Market-Aware)
```javascript
// core/util/pruning.js
async function pruneStaleEntries({ marketState, globalState, market, sharedBlobStore, marketBlobStore, logger }) {
  const retentionMs = market.retentionDays * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const cutoff = now - retentionMs;
  
  // Prune items from THIS market
  const itemsPruned = [];
  for (const [itemId, meta] of Object.entries(marketState.items)) {
    const lastSeenMs = new Date(meta.lastSeen).getTime();
    if (lastSeenMs < cutoff && !meta.archived) {
      // Archive item from this market
      meta.archived = true;
      meta.archivedAt = new Date().toISOString();
      itemsPruned.push(itemId);
      
      // Delete market-specific shipping data
      await marketBlobStore.delete(`market-shipping/${itemId}.json`);
      
      // Check if item should be pruned globally
      const globalMeta = globalState.items[itemId];
      if (globalMeta) {
        // Remove this market from global tracking
        delete globalMeta.markets[market.code];
        
        // If no markets reference this item anymore, prune from shared core
        if (Object.keys(globalMeta.markets).length === 0) {
          await sharedBlobStore.delete(`items/core/${itemId}.json`);
          globalMeta.coreDataExists = false;
          logger.info(`Pruned item ${itemId} from shared core (no market references)`);
        }
      }
    }
  }
  
  // Prune sellers from THIS market
  const sellersPruned = [];
  for (const [sellerId, meta] of Object.entries(marketState.sellers)) {
    const lastSeenMs = new Date(meta.lastSeen).getTime();
    if (lastSeenMs < cutoff && !meta.archived) {
      meta.archived = true;
      meta.archivedAt = new Date().toISOString();
      sellersPruned.push(sellerId);
      
      // Check global seller references
      const globalMeta = globalState.sellers[sellerId];
      if (globalMeta) {
        delete globalMeta.markets[market.code];
        
        // If no markets reference this seller, prune from shared core
        if (Object.keys(globalMeta.markets).length === 0) {
          await sharedBlobStore.delete(`sellers/${sellerId}.json`);
          globalMeta.coreDataExists = false;
          logger.info(`Pruned seller ${sellerId} from shared core (no market references)`);
        }
      }
    }
  }
  
  logger.info(`[${market.code}] Pruned ${itemsPruned.length} items, ${sellersPruned.length} sellers from market`);
  return { itemsPruned, sellersPruned };
}
```

#### Public Output Filtering
When writing market outputs, exclude archived items for that market:
```javascript
// Market index outputs only include non-archived items
const activeItemsInMarket = processedItems.filter(item => {
  const meta = marketState.items[item.id];
  return meta && !meta.archived;
});

await marketBlobStore.set('indexed_items.json', JSON.stringify(activeItemsInMarket));
```

#### Cross-Market Deduplication Example
```
Timeline:
- Day 1: Item 12345 appears in GB market → stored in shared core + GB market state
- Day 30: Item 12345 also appears in DE market → DE references existing shared core
- Day 400: Item 12345 not seen in GB for 365 days → GB archives, deletes GB shipping
- Shared core remains intact (DE still references it)
- Day 430: Item 12345 not seen in DE for 365 days → DE archives
- Shared core deleted (no markets reference it anymore)
```

### 5.4 Resurrection Handling
If an item reappears after archival (seller relists):
- Detect in indexer by signature/ID match
- Unarchive: `meta.archived = false`, remove `archivedAt`
- Update `firstSeen` to original value, `lastSeen` to now
- Item becomes active again

---

## 6. Migration Path & Phasing

### Phase 0: Preparation (Week 1)
**Goal**: Set up infrastructure without breaking existing GB deployment

**Tasks**:
1. Create `scripts/unified-crawler/` directory structure
2. Extract shared modules from existing scripts:
   - `core/auth/login.js` (from item-crawler)
   - `core/http/client.js` (consolidate)
   - `core/persistence/blobStore.js` (new abstraction)
   - `core/util/logger.js` (existing item-crawler logger)
3. Define `config/markets.js` with GB, FR, PT, DE, IT
4. Create unit tests for shared modules
5. Set up CI testing (run tests on PR)
6. Create Netlify Background Functions for crawler stages (`netlify/functions/*-background.*`)
7. Implement a minimal `crawler-index-all` background function and schedule it in `netlify.toml` (cron only, no side effects at first)

**Validation**:
- Existing scripts still work unchanged
- New modules pass unit tests
- No production impact

### Phase 1: Unified Indexer (Week 2)
**Goal**: Consolidate indexer with market awareness, test with GB

**Tasks**:
1. Create `stages/index/` module (wraps existing indexer logic)
2. Make categorization pipeline market-agnostic (already is, just verify)
3. Update endpoint selection to use market config
4. Add pruning logic (disabled by default for safety)
5. Create `orchestration/runStage.js` for indexer stage
6. Add market parameter: `--market=GB`
7. Wire the indexer to a Netlify Background Function (local/dev) and verify scheduled execution

**Testing**:
1. Run unified indexer for GB market
2. Compare outputs (indexed_items.json, sellers.json) with old indexer (byte-for-byte if possible)
3. Verify Netlify Blobs writes
4. Run front-end against new outputs

**Rollout**:
- Run new unified indexer in parallel with old for 1 week
- Monitor for discrepancies
- Switch production to unified indexer

### Phase 2: Unified Item Crawler (Week 3)
**Goal**: Integrate item enrichment stage

**Tasks**:
1. Create `stages/items/` module (wraps item-crawler logic)
2. Port differential crawl logic to shared `orchestration/differential.js`
3. Make shipping extraction market-aware (location filter uses market code)
4. Consolidate cookie jar (shared blob key: `shared/cookies/jar.json`)
5. Add to orchestration: `--stages=index,items`
6. Enforce refresh policy: full every 14 days; reviews-only every run when signature unchanged (subject to time budget)
7. Prioritize share link generation and embed compact USD shipping summary into `indexed_items.json`

**Testing**:
1. Run unified crawler (index+items) for GB
2. Compare per-item JSONs with old item-crawler
3. Verify share links, shipping ranges

**Rollout**:
- Parallel run for 1 week
- Switch production

### Phase 3: Seller Stage – Deferred
**Status**: Deferred until index outputs embed aggregates (shipping USD summaries) and share links are validated in production.

Rationale:
- Sellers analytics depend on stable item aggregates in the market indexes.
- We’ll enable sellers after shipping summaries and share links are in place and observed in production.

Prep Tasks (when re-enabled):
1. Create `stages/sellers/` module
2. Port analytics/leaderboard logic
3. Add to orchestration: `--stages=index,items,sellers`
4. Full pipeline test for GB

### Phase 4: Multi-Market Rollout (Week 5-6)
**Goal**: Deploy FR, PT, DE, IT markets

**Tasks per Market**:
1. Create Netlify Blobs stores (`site-index-fr`, `site-index-pt`, `site-index-de`, `site-index-it`)
2. Run unified crawler: `--market=<CODE> --stages=index,items` (sellers deferred)
3. Verify outputs in each market store
4. Configure Netlify cron schedules in `netlify.toml` for indexing, items, shipping, and pruning per plan
5. Deploy front-ends per market (separate Next.js sites)
6. Roll out markets in this order: FR → PT → DE → IT (adjust as needed)

**Testing**:
1. Smoke test FR/PT/DE/IT front-ends
2. Verify currency display (EUR for EU markets, GBP for GB)
3. Check shipping options (market-specific carriers)
4. Test search/filtering

**Rollout**:
- Soft launch FR (beta.lbindex.fr) for 1 week
- Fix issues, then launch lbindex.fr; repeat for PT, DE, IT

### Phase 5: Pruning Activation (Week 7)
**Goal**: Enable data retention policy

**Tasks**:
1. Add pruning stage to orchestration (after sellers)
2. Configure retention per market (365 days default)
3. Dry-run pruning for GB (log what would be pruned, don't delete)
4. Review logs, adjust retention if needed
5. Enable pruning for all markets

**Monitoring**:
- Track pruned counts per run
- Alert if sudden spike (potential bug)
- Weekly reports on dataset size trends

---

## 7. Environment Configuration

### 7.1 Market-Agnostic Variables
```bash
# Authentication (shared across all markets)
LB_LOGIN_USERNAME=<username>
LB_LOGIN_PASSWORD=<password>

# Netlify (auto-injected in Functions/Build)
NETLIFY_SITE_ID=<site-id>
NETLIFY_API_TOKEN=<api-token>
NETLIFY_BLOBS_TOKEN=<blobs-token>

# Logging
LOG_LEVEL=info  # debug|info|warn|error

# Crawler behavior (global defaults, can override per market)
CRAWLER_MAX_PARALLEL=4
CRAWLER_MIN_DELAY_MS=350
CRAWLER_JITTER_MS=200
CRAWLER_REVIEW_FETCH_SIZE=100
CRAWLER_REVIEW_MAX_STORE=200
CRAWLER_MAX_RUNTIME_MS=900000  # 15 minutes

# Pruning (global defaults)
RETENTION_DAYS=365
PRUNING_ENABLED=true
PRUNING_DRY_RUN=false  # true = log only, don't delete
```

### 7.2 Market-Specific Overrides (Optional)
```bash
# Override retention for specific market
RETENTION_DAYS_DE=180  # 6 months for DE

# Override concurrency for specific market (if needed)
CRAWLER_MAX_PARALLEL_FR=3
```

### 7.3 CLI Usage
```bash
# Run all stages for GB market
node scripts/unified-crawler/cli.js --market=GB --stages=all

# Run only indexer for DE
node scripts/unified-crawler/cli.js --market=DE --stages=index

# Dry-run pruning for all markets
node scripts/unified-crawler/cli.js --market=GB --stages=pruning --dry-run

# Force full crawl (ignore differential logic)
node scripts/unified-crawler/cli.js --market=FR --stages=items --force

# Limit items for testing
node scripts/unified-crawler/cli.js --market=GB --stages=items --limit=50
```

Notes:
- `--stages=all` is an alias for `index,items,sellers,pruning`.
- Individual stages remain supported (e.g., `--stages=index` or `--stages=items`).
- Order/dependencies:
  - `items` expects a recent `index` (or uses cross-market aggregation mode if implemented).
  - `sellers` can run after `index` or independently if reading from shared core.
  - `pruning` should run after other stages to avoid deleting data needed within the same run.

---

## 8. Persistence Layer Design

### 8.1 Blob Store Layout per Market

**Shared Core Store** (`site-index-shared`):
```
site-index-shared/
  items/
    core/
      <itemId>.json          # Full item enrichment (description, reviews, share link)
                             # Crawled once globally, reused by all markets
                             # Schema: { id, refNum, descriptionFull, reviews, share, crawlMeta }
  sellers/
    <sellerId>.json          # Full seller enrichment (manifesto, reviews, share link)
                             # Crawled once globally, reused by all markets
  shared/
    cookies/
      jar.json               # Shared authentication session (all markets)
    state-global.json        # Global crawl state (when items/sellers last fully crawled)
```

**Market Store** (`site-index-gb`, `site-index-de`, `site-index-fr`):
```
site-index-gb/
  # Public outputs (served to frontend)
  indexed_items.json         # Items available in GB market
                             # Schema v2 (compact, minified):
                             #   { id, n, usd, btc?, cat, sid, t,
                             #     vs?: [ { n, usd? } ],
                             #     ship?: { minUSD?, maxUSD?, free?, cnt? },
                             #     sRef: 'market-shipping/123.json',
                             #     cRef: 'shared/items/core/123.json' }
                             # Where:
                             #   n     = name (short title)
                             #   usd   = price in USD (canonical)
                             #   btc   = optional BTC price (if computed during crawl)
                             #   cat   = category code/slug
                             #   sid   = sellerId
                             #   t     = thumbnail URL (or key)
                             #   vs    = minimal variant summary (name and optional USD price)
                             #   ship  = compact shipping summary for THIS market (USD):
                             #           minUSD/maxUSD (ranges), free (boolean), cnt (number of options)
                             #   sRef/cRef = references to full shipping/core docs
                             # Public JSON is written without whitespace for maximum compression.
                             # Heavy fields (full description, full reviews, full shipping options) live in shared core / market-shipping files.
  sellers.json               # Sellers shipping to GB
  snapshot_meta.json         # ETag/version info
  
  data/
    manifest.json            # GB-specific category counts, file map
    items-flower.json        # Per-category chunks (lightweight item refs)
    items-edibles.json
    ...
    recent-items.json        # Recently added/updated in GB market
    item-image-lookup.json   # Quick image URL lookup
  
  # Market-specific enrichment
  market-shipping/
    <itemId>.json            # GB shipping options ONLY (carriers, costs for GB)
                             # Schema: { itemId, options: [...], minShip, maxShip, fetchedAt }
  
  # Internal state
  state.json                 # Market-specific state (lastSeen timestamps per item in GB)
  
  # Optional: Market-specific analytics
  analytics/
    leaderboard-gb.json      # Top sellers in GB market (based on GB reviews/ratings)
    recent-reviews-gb.json   # Recent activity in GB
```

**Storage Efficiency Example**:
- Item fully crawled: ~15KB (description + reviews)
- Item in indexed_items.json: ~2KB (core fields + refs)
- Market shipping: ~0.5KB (just shipping options)

**3 markets without dedup**: 15KB × 5000 items × 3 = 225MB  
**3 markets with dedup**: (15KB × 5000) + (2.5KB × 5000 × 3) = 75MB + 37.5MB = **112.5MB** (~50% savings)

If items are 80% shared: savings increase to ~70%.

### 8.2 State Schema (Unified)
```typescript
// Stored in: site-index-shared/shared/state-global.json
interface GlobalCrawlState {
  version: number;             // Schema version for migrations
  lastUpdated: string;         // ISO timestamp
  
  items: {
    [itemId: string]: GlobalItemMeta;
  };
  
  sellers: {
    [sellerId: string]: GlobalSellerMeta;
  };
}

interface GlobalItemMeta {
  // Global tracking (cross-market)
  firstSeenGlobally: string;   // First appearance in ANY market
  lastFullCrawl?: string;      // Last time full details crawled (description, reviews)
  lastReviewsRefresh?: string; // Last time reviews updated
  signature: string;           // Hash of core item data (detect changes)
  coreDataExists: boolean;     // Whether shared/items/core/<id>.json exists
  
  // Market presence tracking
  markets: {
    [marketCode: string]: {
      firstSeen: string;       // When first seen in this market
      lastSeen: string;        // When last seen in this market
      lastShippingCrawl?: string; // When market-specific shipping last fetched
    }
  };
}

interface GlobalSellerMeta {
  firstSeenGlobally: string;
  lastFullCrawl?: string;      // Last time manifesto/reviews crawled
  coreDataExists: boolean;
  
  markets: {
    [marketCode: string]: {
      firstSeen: string;
      lastSeen: string;
    }
  };
}

// Stored in: site-index-{market}/state.json
interface MarketState {
  market: string;              // 'GB', 'DE', etc.
  version: number;
  lastIndexRun?: string;
  lastPruningRun?: string;
  
  // Lightweight market-specific tracking
  items: {
    [itemId: string]: {
      lastSeen: string;        // Last seen in THIS market's index
      archived: boolean;       // Archived from THIS market (not global)
      archivedAt?: string;
    }
  };
  
  sellers: {
    [sellerId: string]: {
      lastSeen: string;
      archived: boolean;
      archivedAt?: string;
    }
  };
}
```

**State Management Strategy**:
1. **Global state** tracks when items/sellers were last fully crawled (expensive operations)
2. **Market state** tracks when items/sellers appeared in each market (lightweight)
3. **Pruning**: Market state archives independently; global state only archives if ALL markets archived

### 8.3 Backward Compatibility
During migration, existing state files (`seen.json`, `seller-crawler/crawler-state.json`) will be merged into unified `state.json`:
```javascript
async function migrateToUnifiedState(market) {
  const oldItemsSeen = await blobStore.get('seen.json');
  const oldSellerState = await blobStore.get('seller-crawler/crawler-state.json');
  
  const unifiedState = {
    market,
    version: 1,
    items: {},
    sellers: {}
  };
  
  // Migrate item seen data
  for (const [itemId, sig] of Object.entries(oldItemsSeen || {})) {
    unifiedState.items[itemId] = {
      firstSeen: '<unknown>',  // Can't recover exact date
      lastSeen: new Date().toISOString(),
      signature: sig,
      archived: false
    };
  }
  
  // Migrate seller state
  if (oldSellerState?.sellers) {
    for (const [sellerId, meta] of Object.entries(oldSellerState.sellers)) {
      unifiedState.sellers[sellerId] = {
        firstSeen: meta.firstSeen || '<unknown>',
        lastSeen: meta.lastSeen || new Date().toISOString(),
        archived: false
      };
    }
  }
  
  await blobStore.set('shared/state.json', JSON.stringify(unifiedState));
  logger.info('Migrated to unified state');
}
```

---

## 9. Front-End Integration

### 9.1 Multi-Market Next.js Sites

**Deployment Strategy**: Separate Netlify sites per market

| Market | Domain | Netlify Site | Blobs Store | Build Env |
|--------|--------|--------------|-------------|-----------|
| GB | lbindex.vip | biggyindex-gb | site-index-gb | MARKET=GB |
| FR | lbindex.fr | biggyindex-fr | site-index-fr | MARKET=FR |
| PT | lbindex.pt | biggyindex-pt | site-index-pt | MARKET=PT |
| DE | lbindex.de | biggyindex-de | site-index-de | MARKET=DE |
| IT | lbindex.it | biggyindex-it | site-index-it | MARKET=IT |

**Shared Codebase**: Single Next.js repo with market config

### 9.2 Market Configuration in Next.js
```javascript
// src/config/market.js
const MARKETS = {
  GB: {
    code: 'GB',
    currency: 'GBP',
    currencySymbol: '£',
    locale: 'en-GB',
    blobStore: 'site-index-gb',
    domain: 'lbindex.vip'
  },
  DE: {
    code: 'DE',
    currency: 'EUR',
    currencySymbol: '€',
    locale: 'de-DE',
    blobStore: 'site-index-de',
    domain: 'lbindex.de'
  },
  FR: {
    code: 'FR',
    currency: 'EUR',
    currencySymbol: '€',
    locale: 'fr-FR',
    blobStore: 'site-index-fr',
    domain: 'lbindex.fr'
  },
  PT: {
    code: 'PT',
    currency: 'EUR',
    currencySymbol: '€',
    locale: 'pt-PT',
    blobStore: 'site-index-pt',
    domain: 'lbindex.pt'
  },
  IT: {
    code: 'IT',
    currency: 'EUR',
    currencySymbol: '€',
    locale: 'it-IT',
    blobStore: 'site-index-it',
    domain: 'lbindex.it'
  }
};

function getMarket() {
  const code = process.env.NEXT_PUBLIC_MARKET || 'GB';
  return MARKETS[code];
}

export { MARKETS, getMarket };
```

### 9.3 Data Loading (Market-Aware)
```javascript
// src/pages/index.js
import { getMarket } from '@/config/market';

export async function getStaticProps() {
  const market = getMarket();
  
  // Load from market-specific Blobs store
  const { getStore } = await import('@netlify/blobs');
  const marketStore = getStore({ name: market.blobStore });
  
  const manifestStr = await marketStore.get('data/manifest.json');
  const manifest = JSON.parse(manifestStr);
  
  return {
    props: { manifest, market },
    revalidate: 3600 // 1 hour
  };
}

// Load full items list or category
async function loadItems(category = 'All') {
  const market = getMarket();
  const { getStore } = await import('@netlify/blobs');
  const marketStore = getStore({ name: market.blobStore });
  
  const key = category === 'All' 
    ? 'indexed_items.json'
    : `data/items-${category.toLowerCase()}.json`;
  
  const itemsStr = await marketStore.get(key);
  return JSON.parse(itemsStr);
}

// Lazy-load item details from shared core when modal opened
async function loadItemDetails(itemId) {
  const { getStore } = await import('@netlify/blobs');
  const sharedStore = getStore({ name: 'site-index-shared' });
  
  try {
    const coreDataStr = await sharedStore.get(`items/core/${itemId}.json`);
    return JSON.parse(coreDataStr);
  } catch (error) {
    // Fallback: item not yet crawled, return null
    return null;
  }
}

// Load market-specific shipping
async function loadItemShipping(itemId) {
  const market = getMarket();
  const { getStore } = await import('@netlify/blobs');
  const marketStore = getStore({ name: market.blobStore });
  
  try {
    const shippingStr = await marketStore.get(`market-shipping/${itemId}.json`);
    return JSON.parse(shippingStr);
  } catch (error) {
    return null; // No shipping data for this market
  }
}
```

**Frontend Flow**:
1. **List view**: Load `indexed_items.json` from market store (lightweight, contains core fields)
2. **Modal open**: Lazy-fetch `items/core/<id>.json` from shared store (full details)
3. **Shipping display**: Fetch `market-shipping/<id>.json` from market store (market-specific)

**Performance**: 
- Initial load: ~50KB (manifest + first category chunk)
- Modal open: ~15KB (core item) + ~0.5KB (shipping) = one-time fetch, cached
- No duplication across markets in browser cache (shared core is same URL for all)

### 9.4 Currency Display
```javascript
// src/hooks/useCurrency.js
import { getMarket } from '@/config/market';

export function useCurrency() {
  const market = getMarket();
  
  function formatPrice(amount, fromCurrency) {
    // For v2 indexes, amounts are in USD/BTC; convert on the client to the market currency.
    const converted = fromCurrency && fromCurrency !== market.currency
      ? convertCurrency(amount, fromCurrency, market.currency)
      : amount;
    return new Intl.NumberFormat(market.locale, {
      style: 'currency',
      currency: market.currency
    }).format(converted);
  }
  
  return { formatPrice, currency: market.currency };
}
```

### 9.5 I18n Integration (Future)
Use Next.js i18n with market-specific locales:
```javascript
// next.config.js
module.exports = {
  i18n: {
    locales: ['en-GB', 'de-DE', 'fr-FR'],
    defaultLocale: process.env.NEXT_PUBLIC_MARKET === 'DE' ? 'de-DE' 
                 : process.env.NEXT_PUBLIC_MARKET === 'FR' ? 'fr-FR'
                 : 'en-GB'
  }
};
```

### 9.6 Optimistic Loading Pattern

Since item core data is shared across markets, implement smart caching:

```javascript
// src/lib/itemCache.js
const coreCache = new Map(); // In-memory cache for core item data

export async function getItemWithDetails(itemId, marketCode) {
  const { getStore } = await import('@netlify/blobs');
  
  // Load lightweight market data first (fast)
  const marketStore = getStore({ name: `site-index-${marketCode.toLowerCase()}` });
  const marketDataStr = await marketStore.get(`market-shipping/${itemId}.json`);
  const marketData = JSON.parse(marketDataStr);
  
  // Check cache for core data
  if (coreCache.has(itemId)) {
    return { ...coreCache.get(itemId), shipping: marketData };
  }
  
  // Lazy-load core data (slower, but cached)
  const sharedStore = getStore({ name: 'site-index-shared' });
  const coreDataStr = await sharedStore.get(`items/core/${itemId}.json`);
  const coreData = JSON.parse(coreDataStr);
  
  coreCache.set(itemId, coreData);
  
  return { ...coreData, shipping: marketData };
}

// Optional: Pre-warm cache on build
export async function preloadPopularItems(itemIds) {
  const { getStore } = await import('@netlify/blobs');
  const sharedStore = getStore({ name: 'site-index-shared' });
  
  await Promise.all(itemIds.map(async (id) => {
    try {
      const coreDataStr = await sharedStore.get(`items/core/${id}.json`);
      coreCache.set(id, JSON.parse(coreDataStr));
    } catch {}
  }));
}
```

**Frontend Performance Benefits**:
- First view: Show list with basic fields immediately (market store)
- Modal open: Fetch core data if not cached (~15KB, one-time per item)
- Subsequent modals: Instant (cached in browser + memory)
- Cross-market: If user switches from lbindex.de to lbindex.fr, browser cache shared for core data (same blob URL)

---

## 10. Testing Strategy

### 10.1 Unit Tests
**Coverage Target**: 80%+

**Per Module**:
- `core/auth/login.js`: Mock HTTP responses, verify retry logic
- `core/http/client.js`: Test timeout, backoff, headers
- `core/persistence/blobStore.js`: Mock Netlify Blobs SDK
- `stages/index/categorize.js`: Existing test suite (already comprehensive)
- `core/util/pruning.js`: Test retention logic with various timestamps
- `stages/index/encodeIndexV2.js`: Validate compact key mapping (id,n,usd,btc?,cat,sid,t,vs?,ship?,sRef,cRef) and round-trip decoding for the frontend adapter

**Framework**: Jest (existing in repo)

### 10.2 Integration Tests
**Scenarios**:
1. **Full pipeline GB**: Run all stages, verify outputs match expected schema
2. **Full pipeline DE**: Ensure market-specific data (EUR, DE shipping)
3. **Differential crawl**: Verify skip/full/reviews logic
4. **Pruning**: Create fake old items, verify archival
5. **Resurrection**: Archive item, re-run indexer with same item, verify unarchival

**Data Fixtures**:
- Snapshot real API responses (anonymized)
- Mock Blobs with pre-seeded data

### 10.3 Snapshot Testing
Validate output stability:
```javascript
// tests/integration/snapshots/index-gb.test.js
test('GB indexer output matches snapshot', async () => {
  const result = await runStage('index', { market: 'GB', limit: 10 });
  expect(result.manifest).toMatchSnapshot();
  expect(result.items[0]).toMatchSnapshot({
    id: expect.any(Number),
    lastUpdatedAt: expect.any(String)
  });
});
```

### 10.4 Performance Benchmarks
Track regression:
- Indexer runtime (target: <60s for 5000 items)
- Item crawler runtime (target: <15min for 500 items)
- Blob write times (target: <5s for large JSON)

---

## 11. Performance & Optimization

### 11.1 Concurrency Tuning per Market
Different markets may have different dataset sizes:
```javascript
// Auto-tune concurrency based on worklist size
function getOptimalConcurrency(itemCount, market) {
  const base = market.maxParallel || 4;
  if (itemCount < 100) return Math.min(base, 2);
  if (itemCount < 500) return base;
  return Math.min(base * 1.5, 8); // Cap at 8
}
```

### 11.2 Blob Batching
Batch small writes to reduce API calls:
```javascript
// Instead of 100 individual set() calls for per-item JSONs:
const batch = [];
for (const item of items) {
  batch.push({ key: `items/${item.id}.json`, value: JSON.stringify(item) });
}
await blobStore.setMany(batch); // Single API call
```

### 11.3 Caching Strategies
- **Cookie jar**: Cache in memory during run, write once at end
- **Market config**: Singleton, loaded once per process
- **State**: Load once, update in-memory, write once after pruning

### 11.4 Incremental Outputs
For large markets (>10k items), write outputs incrementally:
```javascript
// Write per-category chunks during indexing, not at end
async function writeCategory(category, items) {
  await blobStore.set(`data/items-${category}.json`, JSON.stringify(items));
}
```

---

## 12. Deployment Architecture

### 12.0 Orchestration: Netlify Background Functions

We will use **Netlify Background Functions** for crawler orchestration. Background functions have a 15-minute execution limit and are invoked by appending `-background` to the function filename.

**Orchestration Strategy**:
- **Sequential execution**: Index all markets → Items crawler (deduped) → Pruning
  - Sellers stage is currently deferred; exclude it from default schedules.
- **Shared state**: Use global state in blobs to coordinate stages
- **Comprehensive logging**: Console.log statements for Netlify function observability
- **Graceful handling**: Save progress if approaching timeout, resume on next invocation

**Function Architecture**:
```javascript
// netlify/functions/crawler-all-markets-background.js
const { main } = require('../../scripts/unified-crawler/cli');

exports.handler = async (event, context) => {
  console.log('[crawler] Starting multi-market crawl');
  const startTime = Date.now();
  const results = {};
  
  try {
    // Stage 1: Index all markets independently
    console.log('[crawler] Stage 1: Indexing markets');
    for (const marketCode of ['GB', 'DE', 'FR']) {
      const marketStart = Date.now();
      console.log(`[crawler:index:${marketCode}] Starting...`);
      
      results[marketCode] = await main({
        market: marketCode,
        stages: ['index']
      });
      
      const elapsed = ((Date.now() - marketStart) / 1000).toFixed(1);
      console.log(
        `[crawler:index:${marketCode}] Complete: ${results[marketCode].counts?.items || 0} items (${elapsed}s)`
      );
    }
    
    // Stage 2: Global item crawl (deduped across all markets)
    console.log('[crawler] Stage 2: Global item crawler (deduped)');
    const crawlStart = Date.now();
    const crawlResult = await main({
      market: 'ALL', // Special mode: aggregate work from all markets
      stages: ['items'] // sellers deferred
    });
    results.globalCrawl = crawlResult;
    
    const crawlElapsed = ((Date.now() - crawlStart) / 1000).toFixed(1);
    console.log(
      `[crawler:items] Complete: ${crawlResult.counts?.itemsCrawled || 0} items crawled (${crawlElapsed}s)`
    );
    
    // Stage 3: Market-specific shipping extraction (if needed)
    console.log('[crawler] Stage 3: Market-specific shipping');
    for (const marketCode of ['GB', 'DE', 'FR']) {
      const shipStart = Date.now();
      console.log(`[crawler:shipping:${marketCode}] Extracting...`);
      
      await main({
        market: marketCode,
        stages: ['shipping-extract'] // Lightweight stage
      });
      
      const shipElapsed = ((Date.now() - shipStart) / 1000).toFixed(1);
      console.log(`[crawler:shipping:${marketCode}] Complete (${shipElapsed}s)`);
    }
    
    // Stage 4: Pruning per market
    console.log('[crawler] Stage 4: Pruning');
    for (const marketCode of ['GB', 'DE', 'FR']) {
      const pruneStart = Date.now();
      console.log(`[crawler:prune:${marketCode}] Starting...`);
      
      await main({
        market: marketCode,
        stages: ['pruning']
      });
      
      const pruneElapsed = ((Date.now() - pruneStart) / 1000).toFixed(1);
      console.log(`[crawler:prune:${marketCode}] Complete (${pruneElapsed}s)`);
    }
    
    const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[crawler] All stages complete (${totalElapsed}s total)`);
    
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        success: true, 
        results,
        totalSeconds: parseFloat(totalElapsed),
        timestamp: new Date().toISOString()
      })
    };
  } catch (error) {
    console.error('[crawler] Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: error.message, 
        stack: error.stack 
      })
    };
  }
};
```

**Scheduling in netlify.toml**:
```toml
# Main crawler - runs all markets sequentially
[[functions]]
  name = "crawler-all-markets-background"
  schedule = "0 */6 * * *"  # Every 6 hours
```

**Alternative: Separate Functions per Stage** (if single function times out):
```toml
# Index all markets
[[functions]]
  name = "crawler-index-all-background"
  schedule = "0 */6 * * *"   # Every 6 hours at :00
  
# Items (deduped, reads from fresh indexes)
[[functions]]
  name = "crawler-items-background"
  schedule = "15 */6 * * *"  # Every 6 hours at :15 (wait for indexes)
  
# Shipping extraction (lightweight)
[[functions]]
  name = "crawler-shipping-background"
  schedule = "30 */6 * * *"  # Every 6 hours at :30
  
# Pruning (per market)
[[functions]]
  name = "crawler-pruning-background"
  schedule = "45 */6 * * *"  # Every 6 hours at :45
```

### 12.1 Logging Best Practices

**Structured Console Logging**:
```javascript
// Use consistent prefixes for filtering logs
console.log('[crawler:index:GB] Starting index for GB market');
console.log('[crawler:items] Processing 150 items in worklist');
console.error('[crawler:items] Failed to fetch item 12345:', error.message);

// Include metrics in logs
console.log('[crawler:index:GB] Complete: 5234 items, 1876 sellers (45.2s)');

// Log progress periodically (every 10 items, etc.)
if (processed % 10 === 0) {
  console.log(`[crawler:items] Progress: ${processed}/${total} (${elapsed}s)`);
}
```

**Error Handling with Context**:
```javascript
try {
  await processItem(itemId);
} catch (error) {
  console.error(`[crawler:items] Failed item ${itemId}:`, {
    error: error.message,
    itemId,
    market,
    stack: error.stack.split('\n').slice(0, 3).join('\n') // First 3 lines
  });
  // Continue processing other items
}
```

### 12.2 Netlify Functions (Per Market - Alternative)

**Per Market**: Separate scheduled function

```javascript
// netlify/functions/crawler-gb-background.js
const { main } = require('../../scripts/unified-crawler/cli');

exports.handler = async (event, context) => {
  console.log('[crawler:GB] Starting GB market crawl');
  const startTime = Date.now();
  
  try {
    const result = await main({
      market: 'GB',
      stages: ['index', 'items', 'sellers', 'pruning']
    });
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[crawler:GB] Complete (${elapsed}s)`);
    
    return {
      statusCode: 200,
      body: JSON.stringify(result)
    };
  } catch (error) {
    console.error('[crawler:GB] Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
```

**Scheduling**:
```toml
[[functions]]
  name = "crawler-gb-background"
  schedule = "0 */6 * * *"  # Every 6 hours

[[functions]]
  name = "crawler-de-background"
  schedule = "0 2,8,14,20 * * *"  # Every 6 hours, offset by 2h

[[functions]]
  name = "crawler-fr-background"
  schedule = "0 4,10,16,22 * * *"  # Every 6 hours, offset by 4h
```

**Pros/Cons**:
- **Single function (12.0)**: Simpler, guaranteed order, single timeout window, easier to coordinate deduplication
- **Separate per-market (12.2)**: More resilient to partial failures, easier debugging, independent market scaling
- **Separate per-stage (12.0 alternative)**: Best resilience, requires careful state coordination between stages

### 12.3 Build-Time Indexing
For initial deployment or full refresh, run indexer during build: (DISREGARD, ALWAYS BLOBS)
```json
// package.json
{
  "scripts": {
    "build:gb": "MARKET=GB node scripts/unified-crawler/cli.js --stages=index && next build",
    "build:de": "MARKET=DE node scripts/unified-crawler/cli.js --stages=index && next build",
    "build:fr": "MARKET=FR node scripts/unified-crawler/cli.js --stages=index && next build"
  }
}
```

### 12.4 Monitoring & Alerts
**Metrics to Track** (via Netlify Functions logs or external service):
- Run duration per stage
- Items/sellers processed count
- Error rate
- Blob storage usage per market
- Pruned items count

**Alerts**:
- Function timeout (>15min)
- High error rate (>5%)
- Sudden drop in item count (>20% decrease)
- Pruning spike (>1000 items in single run)

**Implementation**: Use Netlify Build Plugins or external monitoring (Sentry, Datadog)

---

## Appendix A: Code Cleanup & Improvements

### A.1 Indexer Improvements
**Current Issues**:
- Hardcoded `shipsTo=GB` in multiple places
- Accept-Language hardcoded
- No pruning logic
- Some deprecated code (country normalization commented out)

**Fixes**:
- ✅ Extract market config to shared module
- ✅ Make endpoints/headers market-aware
- ✅ Add pruning stage
- ✅ Remove commented-out code
- ✅ Consolidate duplicate helpers (buildItemUrl exists in 2 places)

### A.2 Item Crawler Improvements
**Current Issues**:
- Complex differential crawl logic (hard to test)
- Partial HTML streaming logic could be clearer
- Cookie jar loading tries multiple paths (error-prone)

**Fixes**:
- ✅ Extract differential logic to testable function
- ✅ Simplify HTML streaming (clear abort conditions)
- ✅ Unified cookie store with single source of truth

### A.3 Seller Crawler Improvements
**Current Issues**:
- Duplicates some logic from item crawler (reviews fetch)
- Leaderboard computation is in orchestration file (should be module)

**Fixes**:
- ✅ Reuse shared reviews fetch module
- ✅ Extract leaderboard to `stages/sellers/analytics/leaderboard.js`

### A.4 Shared Improvements
- ✅ Consistent error handling (use custom error classes)
- ✅ Structured logging (JSON output for production)
- ✅ Better TypeScript type hints (JSDoc if not full TS migration)
- ✅ Comprehensive inline documentation

---

## Appendix B: Future Enhancements

### B.1 TypeScript Migration (Optional)
After refactor stabilizes, optionally migrate core modules to TypeScript for:
- Better IDE support
- Compile-time type checking
- Easier onboarding for contributors

**Phased Approach**:
1. Add `tsconfig.json` (allowJs: true)
2. Convert shared modules first (`core/*`)
3. Convert stages incrementally
4. Keep orchestration in JS if preferred

### B.2 GraphQL API (Optional)
Expose unified data via GraphQL endpoint:
```graphql
query GetItems($market: String!, $category: String, $limit: Int) {
  items(market: $market, category: $category, limit: $limit) {
    id
    name
    price
    category
    seller { id name rating }
  }
}
```

Benefits: Front-end can fetch exactly what it needs, reducing payload size.

### B.3 Real-Time Updates (Future)
Use WebSockets or Server-Sent Events for live updates:
- Notify front-end when new items added
- Update endorsement counts in real-time

Implementation: Netlify Edge Functions + Durable Objects (if available)

### B.4 Machine Learning Enhancements
- Auto-categorization improvements (train model on historical data)
- Spam/scam detection (flag suspicious listings)
- Price anomaly detection (alert on sudden price jumps)

### B.5 Multi-Currency Exchange Rates
Fetch real-time FX rates from API (e.g., exchangerate-api.com):
- Convert all prices to market currency on load
- Update rates daily

---

## Appendix C: Risk Mitigation

### C.1 Identified Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Multi-market API rate limiting | High | Medium | Stagger crawls per market; monitor 429 responses |
| Blob storage quota exceeded | Medium | Low | Track usage; enable pruning; alert at 80% |
| Front-end breaks on schema change | High | Medium | Versioned schemas; backward compatibility |
| Data loss during migration | High | Low | Backup existing Blobs before migration; dry-run first |
| Performance regression | Medium | Medium | Benchmark before/after; incremental rollout |
| Currency conversion accuracy | Low | Low | Use well-established FX API; fallback to raw prices |

### C.2 Rollback Plan
If unified crawler causes issues:
1. Revert Netlify Function to call old scripts (`scripts/legacy/index-items.js`)
2. Restore old Blobs keys (keep backups for 30 days)
3. Investigate issue offline
4. Fix and re-deploy

**Pre-Requisite**: Keep old scripts functional in `scripts/legacy/` for 1 month post-migration.

---

## Appendix D: Timeline & Milestones

| Week | Phase | Milestone | Deliverable |
|------|-------|-----------|-------------|
| 1 | Phase 0 | Prep complete | Shared modules extracted, tests pass |
| 2 | Phase 1 | Unified indexer | GB indexer outputs match old version |
| 3 | Phase 2 | Item crawler | GB item JSONs match old version |
| 4 | Phase 3 | Seller crawler | Full GB pipeline working |
| 5 | Phase 4 | DE market | DE site launched (beta) |
| 6 | Phase 4 | FR market | FR site launched (beta) |
| 7 | Phase 5 | Pruning | Data retention active for all markets |
| 8 | Buffer | Polish | Documentation, final testing, launch |

**Total Duration**: 8 weeks (assumes 1 FTE developer)

---

## Appendix E: Success Metrics

**Post-Launch KPIs** (3 months after DE/FR launch):

1. **Code Quality**:
   - Lines of duplicated code: <5% (down from ~30% current)
   - Test coverage: >80%
   - Linting errors: 0

2. **Performance**:
   - Full crawl runtime (GB, 5000 items): <15 minutes
   - Blob storage per market: <500MB
   - API error rate: <1%

3. **User Metrics**:
   - DE/FR site traffic: >100 unique visitors/day within 3 months
   - Front-end load time: <2s (p95)
   - Search response time: <200ms

4. **Operational**:
   - Zero critical bugs in production
   - Mean time to deploy new market: <1 day
   - Successful pruning runs: 100% (no data loss)

---

## Conclusion

This refactor plan provides a comprehensive roadmap to:
1. **Unify** three separate crawlers into a cohesive, maintainable system
2. **Enable** multi-market support with minimal duplication
3. **Improve** code quality and developer experience
4. **Implement** data retention to prevent indefinite growth
5. **Scale** to additional markets in the future with ease

**Next Steps**:
1. Review and approve this plan
2. Set up project tracking (GitHub Projects or similar)
3. Allocate resources (developer time, Netlify quota)
4. Begin Phase 0 (preparation)

**Questions for Decision**:
- Confirm retention period (365 days OK for all markets?)
- Separate Blobs stores vs. prefixes? (Recommendation: separate)
- TypeScript migration priority? (Recommendation: defer to Phase 6+) Answer: Let's priortise it.
- FX conversion: build in-house or use API? (Recommendation: API). Answer: API. Currently we use https://open.er-api.com/v6/latest/GBP for GBP

---

**Document Version**: 1.0  
**Author**: AI Assistant  
**Date**: 2025-10-12  
**Status**: DRAFT – Awaiting Review
