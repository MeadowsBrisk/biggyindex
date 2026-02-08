# BiggyIndex — Item Index & UI

[biggyindex.com](https://biggyindex.com)

An independent, lightweight index of public listings on LittleBiggy, with search, categorization, multi-market support, and an improved UI. The index does not sell anything — it surfaces public data and links back to the original seller pages.

## What's in this repository

- **Unified Crawler** (`scripts/unified-crawler/`): Multi-stage pipeline that fetches, enriches, translates, and optimizes item data across 6 markets (GB, DE, FR, PT, IT, ES). Persists all data to Cloudflare R2.
- **Front-end** (Next.js 16, Pages Router): Fast, localised UI (Tailwind v4 + Jotai + next-intl) with filtering, sorting, favourites, endorsements, and per-market translations.
- **Netlify Functions**: Scheduled background functions that run the crawler pipeline on a cadence.

## How it works

### 1. Unified Crawler → `scripts/unified-crawler/`
Multi-stage pipeline orchestrated via CLI (`yarn uc --stage=<stage>`):

| Stage | Schedule | Purpose |
|-------|----------|---------|
| **Index** | Every 30 min | Scrape marketplace per market, fast-enrich up to 20 new items inline |
| **Items** | Every 4h | Full enrichment — descriptions, reviews, shipping, images |
| **Sellers** | Every 4h (offset) | Seller profiles, reputation, review aggregation |
| **Translate** | Daily | Translate names/descriptions for non-GB markets via Azure |
| **Images** | Daily | Catch-up image optimization + stale R2 cleanup |
| **Pricing** | Daily | Price-per-gram aggregates for weight-based sorting |

All data stored in Cloudflare R2 (`biggyindex-data` bucket). Images stored in separate R2 bucket (`biggyindex-images`).

### 2. Front-end → `src/pages/`
- API routes read from R2, return JSON with `?mkt=XX` param for market selection
- All items loaded at once in `getStaticProps`; category switching is purely client-side filtering
- On-demand ISR: crawler triggers `/api/revalidate` after each run for immediate page rebuilds
- Fallback `revalidate: 2400` (40 min) safety net in case on-demand revalidation fails
- Item detail overlays lazy-fetch per-item data from R2
- Endorsement counts stored in Neon (Postgres) with optimistic UI

### 3. Multi-Market Routing
- **Production**: Subdomain-based (`de.biggyindex.com`, `fr.biggyindex.com`, etc.)
- **Local dev**: Path-based (`/de`, `/fr`)
- 6 locales: `en-GB`, `de-DE`, `fr-FR`, `pt-PT`, `it-IT`, `es-ES`

## Tech stack
- Next.js 16 (Pages Router), React 19 (with React Compiler), TypeScript
- Tailwind CSS v4, Jotai state management, Framer Motion animations
- next-intl for i18n, @aws-sdk/client-s3 for R2 access
- Netlify Functions (background, scheduled), Neon Postgres for endorsements
- Biome for linting/formatting, Sharp for image optimization

## Quick start

Prerequisites: Node.js 20+, Yarn

```bash
# Install dependencies
yarn

# Run the app (dev)
yarn dev
```
Then open http://localhost:3000. Data is served from R2 — no local indexing required for frontend dev.

```bash
# Production build
yarn build

# Run the crawler (requires credentials)
yarn uc --stage=index --markets=GB --limit=10
```

## Key commands

```bash
yarn dev              # Next.js dev server (port 3000)
yarn build            # Production build
yarn lint             # Biome check
yarn format           # Biome format --write

# Unified Crawler stages
yarn uc:index         # Index all markets
yarn uc:items         # Enrich items
yarn uc:sellers       # Seller analytics
yarn uc:translate     # Translate for non-GB markets
yarn uc:images        # Image optimization
yarn uc:pricing       # Price-per-gram
yarn uc:all           # Full pipeline (index → items → sellers)
```

## Data storage

All data lives in Cloudflare R2 (S3-compatible):

| Bucket | Content |
|--------|---------|
| `data` | Item/seller JSON, aggregates, per-market indexes |
| `images` | Optimized AVIF thumbnails, full-size, animated WebP |

Key structure:
```
shared/items/{id}.json              # Canonical item data
shared/sellers/{id}.json            # Seller profiles
shared/aggregates/*.json            # Translations, image-meta, shares
markets/{code}/indexed_items.json   # Per-market item index
markets/{code}/data/manifest.json   # Category counts
markets/{code}/market-shipping/{id}.json  # Shipping + translations
```

## Endorsements

Lightweight up-vote stored in Neon (Postgres):
- `GET /api/endorse?ids=id1,id2` → vote counts
- `POST /api/endorse` with `{ itemId, cid }` → one vote per rolling window
- Pseudonymous client ID, optimistic UI

## Environment variables

| Variable | Purpose |
|----------|---------|
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Cloudflare R2 access |
| `LB_USERNAME`, `LB_PASSWORD` | Crawler authentication |
| `AZURE_TRANSLATOR_KEY`, `AZURE_TRANSLATOR_REGION` | Translation API |
| `NETLIFY_DATABASE_URL` | Neon Postgres (endorsements) |
| `NEXT_PUBLIC_R2_IMAGE_URL` | Public R2 image URL |
| `VOTE_HASH_SALT` | Endorsement security salt |
