# BiggyIndex

**[biggyindex.com](https://biggyindex.com)** — an independent, open-source index for
[Little Biggy](https://littlebiggy.org). BiggyIndex crawls the marketplace, categorises
every listing, tracks prices, reviews and seller history over time, and serves it all as a
fast, filterable catalogue across ten European market editions.

This repository is the complete production frontend. It is public so that the
security-conscious people who use it don't have to take our word for what it does —
read the source, build it, compare.

> **Not the marketplace.** BiggyIndex indexes Little Biggy; it doesn't sell anything,
> process payments, or handle accounts. Always verify you are on the real Little Biggy
> via the official links surfaced throughout this site:
> **littlebiggy.org** · **littlebiggy.org/4791812** (canon borg, announcements & PGP) ·
> **littlebiggy.zone** (verified mirrors & onion).

## What the site does

- **Browse & filter** ~900 live listings per market — category, subcategory, attributes
  (strain family, hash process, tier…), price range, seller, free-text search. Filters are
  URL-synced and shareable.
- **Item history** — first-seen / last-updated tracking and price history charts. We are
  the only source for this data; the marketplace itself doesn't expose it.
- **Seller profiles** — ratings, delivery times, endorsements/reports, full catalogues.
- **Review feed** — buyer reviews with photos, mirrored and optimised.
- **[Little Biggy status](https://biggyindex.com/littlebiggy-status)** — independent
  uptime monitoring, probed every 10 minutes.
- **Ten market editions** on subdomains (GB, IE, DE, FR, PT, IT, ES, GR, CZ, PL) with
  full UI translation in nine languages and market-local currency display.

## How it works

```
┌──────────────┐     JSON (Brotli)      ┌─────────────────┐
│  crawler     │ ──────────────────────▶ │  Cloudflare R2  │
│  (private)   │   items, sellers,      │  + CDN           │
└──────────────┘   reviews, status      └────────┬────────┘
                                                 │ fetch (no-store)
                                                 ▼
                                        ┌─────────────────┐
                                        │  this repo       │
                                        │  Next.js 16 App  │
                                        │  Router (ISR +   │
                                        │  cache tags)     │
                                        └─────────────────┘
```

The frontend is a pure consumer: it reads published JSON snapshots from a CDN and
renders them. A separate crawler pipeline (private — it embodies most of the
categorisation and anti-breakage work) refreshes the data hourly and pings a
revalidation endpoint here when something actually changed.

### Stack

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Server Components, PPR / `use cache`) |
| UI state | [Jotai](https://jotai.org) |
| Filter state | [nuqs](https://nuqs.dev) — URL-synced, back-button-friendly |
| Styling | Tailwind CSS v4 (CSS-first `@theme`, dark/light) |
| i18n | [next-intl](https://next-intl.dev) v4, 10 locales from one YAML source |
| Validation | zod |
| Lint/format | Biome |

### Data format

Item payloads use minified keys to keep the wire format small (`n` name, `d` description,
`v` variants, `uMin`/`uMax` USD price bounds, `rs` review stats, `fsa`/`lua`
first-seen/last-updated, `at` attributes, …). Filtering happens on USD bounds; display
converts to the market currency at current rates.

## Running it locally

```bash
yarn install
yarn dev          # http://localhost:3000 — regenerates i18n messages first
```

The dev server runs against the production data CDN out of the box — the data URLs
below are public read-only endpoints, so a fresh clone shows the real catalogue.

```bash
# .env.local
NEXT_PUBLIC_R2_DATA_URL=https://cdn.biggyindex.com
NEXT_PUBLIC_R2_IMAGES_URL=https://img.biggyindex.com
```

Optional (all degrade gracefully when absent):

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUGGESTIONS_API` | Search-suggestion worker endpoint |
| `NEXT_PUBLIC_TELEGRAM_CHANNEL_URL` | Adds the Telegram link in the footer |
| `REVALIDATION_SECRET` | Auth for `/api/revalidate` (crawler-triggered ISR purge) |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Only for server-side R2 access paths; not needed for local browsing |
| `AZURE_TRANSLATOR_*` | Only for `yarn i18n:translate` (maintainer tooling) |

Market editions are host-based: `de.biggyindex.com` serves the German market. Locally you
can approximate a market by sending the Host header, e.g.
`curl -H "Host: de.biggyindex.com" http://localhost:3000/`.

### Useful scripts

```bash
yarn lint             # Biome check (writes fixes)
yarn i18n:build       # Regenerate per-locale JSON from src/messages/messages.yaml
yarn check:filter-engine  # Filter-engine invariants
```

**Translations:** all copy lives in `src/messages/messages.yaml`. A bare string is
en-GB with fallback everywhere; per-locale maps override. The generated
`src/messages/<locale>/index.json` files are build artifacts — never edit them.

## Project structure

```
src/
├── app/                  # App Router routes ([locale]/browse, /item, /seller, …)
├── components/           # UI components (Server Components by default)
├── lib/                  # Domain logic: markets, categories, filters, SEO, currency
├── i18n/                 # next-intl routing + message loading
├── messages/             # messages.yaml (source) + generated locale JSON
└── proxy.ts              # Edge middleware: locale routing + legacy redirects
```

## Contributing

Issues and PRs are welcome — bug reports, translation fixes and accessibility
improvements especially. Keep in mind:

- The crawler and its data pipeline are not part of this repo; issues about data
  *content* (miscategorised items, stale prices) are still useful — file them here.
- `yarn lint` and `npx tsc --noEmit` must pass.
- UI copy changes go in `messages.yaml`, never in the generated JSON.

## License

[AGPL-3.0](./LICENSE). You may run, study, share and modify this software; if you run a
modified version as a network service, you must offer its source to your users. Chosen
deliberately: nobody should be able to run a quietly-modified clone of this site.
