# LittleBiggy Items Index — Indexer, Crawler, and UI

An independent, lightweight index of public listings on LittleBiggy, with improved search, categorization, and browsing experience. The index does not sell anything. It surfaces public data and links back to the original seller pages.

## What’s in this repository
- Indexer (Node/serverless): Fetches public listings, normalizes fields, categorizes items, and writes static JSON artifacts under `public/`.
- Crawler (Node/serverless): Authenticated fetch that enriches items with details like reviews, shipping options, referral/share links, and full descriptions.
- Front‑end (Next.js): A fast, minimal UI (Tailwind v4 + Jotai) that loads the generated JSON and provides filtering, sorting, favourites, and endorsements.

## How it works (high level)
1) Indexer → `scripts/indexer/index-items.js`
	- Fetches items, applies a keyword/heuristic classification pipeline (e.g., Flower, Hash, Edibles, Vapes, etc.).
	- Outputs:
	  - `public/indexed_items.json` (full dataset)
	  - `public/data/manifest.json` (counts + file map)
	  - `public/data/items-<category>.json` (per‑category shards)
	  - `public/sellers.json` (aggregate seller stats)
    - Supports filesystem or Netlify blobs.

2) Crawler (enrichment) → `scripts/item-crawler/*`
	- Adds per‑item details when available: share/referral link, shipping options and summary range, description, and a reviews snapshot.
	- Writes:
	  - `public/item-crawler/items/<refNum>.json` (one file per item)
	  - `public/item-crawler/index-supplement.js` (aggregated share + shipping range map)
	- When running in Netlify Functions, persistence can use Netlify Blobs; locally it falls back to filesystem.

3) UI → `src/pages/*`
	- Loads `manifest.json` first, then the appropriate item JSON (full or per‑category) on demand.
	- Clicking an item opens a detail overlay that lazily fetches the crawler’s per‑item JSON when present.
	- Endorsement (vote) counts are stored in Netlify Blobs with a simple API and optimistic UI updates.

## Tech stack
- Next.js 15 (Pages Router), React 19, Tailwind CSS v4
- Jotai for state, Framer Motion animations
- Netlify Functions; Neon (Postgres) for endorsements; Netlify Blobs for certain crawler artifacts
- Axios + cookie jar support in the crawler

## Quick start
Prerequisites: Node.js 18+, Yarn

Install dependencies:
```bash
yarn
```

Generate data (run the indexer):
```bash
yarn index
```

Run the app (dev):
```bash
yarn dev
```
Then open http://localhost:3000

Build for production:
```bash
yarn build
```
This runs the indexer and then builds the Next.js site.

Optional: run the crawler (requires LittleBiggy credentials)
```bash
node scripts/item-crawler/crawl-items.js --limit=50
```
Environment variables (set in your shell, `.env`, or Netlify):
- `LB_LOGIN_USERNAME`, `LB_LOGIN_PASSWORD` — for the crawler
- `CRAWLER_*` — see `item-crawler-plan.md` for options

## Data files produced
- `public/indexed_items.json` — entire processed list (may include uncategorized)
- `public/data/manifest.json` — counts, category files, price bounds
- `public/data/items-<category>.json` — category‑specific subsets
- `public/sellers.json` — seller stats
- `public/item-crawler/items/<refNum>.json` — enriched per‑item details (when crawled)
- `public/item-crawler/index-supplement.js` — links + shipping info (when crawled)

## Endorse (vote) feature
A lightweight up‑vote stored in Neon (Postgres) via Netlify’s database integration so counts persist without rebuilding (falls back to in‑memory in local/dev if no DB configured).

API (simplified):
- `GET /api/endorse?ids=id1,id2` → `{ votes: { id: count }, windowBucket }`
- `POST /api/endorse` with `{ itemId, cid }` → one vote per rolling window

Client behavior:
- Generates a pseudonymous `voteCid` in localStorage
- Optimistic UI update; persists endorsed items by bucket in `endorsedBuckets`

Environment variables:
- `NETLIFY_DATABASE_URL` — Neon Postgres connection string (production)
- `VOTE_WINDOW_HOURS` (default 24)
- `VOTE_HASH_SALT` (set a secure random string in production)
- `VOTE_IP_MAX` (reserved for future rate limiting)

For more, see `docs/endorsements_plan.md`.
