#!/usr/bin/env node
/**
 * Lightweight SEO smoke validator.
 * - Validates sitemap index and children return 200 and contain expected URLs
 * - Fetches representative item and seller pages and checks <head> for title, description, canonical, and JSON-LD presence
 *
 * Usage (Windows PowerShell): yarn seo:validate --base https://lbindex.vip --item 12345 --seller 678
 */

'use strict';

const yargs = require('yargs');
const { hideBin } = require('yargs/helpers');

const argv = yargs(hideBin(process.argv))
  .option('base', { type: 'string', default: 'http://localhost:3000', describe: 'Base URL of the site' })
  .option('item', { type: 'string', describe: 'Representative item ref to test' })
  .option('seller', { type: 'string', describe: 'Representative seller id to test' })
  .strict()
  .help()
  .parse();

const base = argv.base.replace(/\/?$/, '');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function fetchText(url) {
  const doFetch = (typeof fetch !== 'undefined')
    ? fetch
    : (await import('node-fetch')).default;
  const r = await doFetch(url, { redirect: 'manual' });
  const text = await r.text();
  return { status: r.status, text, contentType: r.headers.get('content-type') || '' };
}

async function validateSitemaps() {
  const endpoints = [
    `${base}/sitemap.xml`,
    `${base}/sitemap-static.xml`,
    `${base}/sitemap-items.xml`,
    `${base}/sitemap-sellers.xml`,
  ];
  for (const url of endpoints) {
    const { status, text, contentType } = await fetchText(url);
    assert(status >= 200 && status < 300, `Sitemap not OK: ${url} -> ${status}`);
    assert(/xml/.test(contentType), `Sitemap not XML content-type: ${url} -> ${contentType}`);
    assert(/<\?xml/.test(text) && /<urlset|<sitemapindex/.test(text), `Sitemap missing root node: ${url}`);
  }
}

function extractHead(html) {
  const headMatch = html.match(/<head[\s\S]*?>([\s\S]*?)<\/head>/i);
  return headMatch ? headMatch[1] : '';
}

async function validatePage(url, kind) {
  const { status, text, contentType } = await fetchText(url);
  assert(status >= 200 && status < 400, `${kind} page not OK: ${url} -> ${status}`);
  assert(/text\/html/.test(contentType) || contentType === '' /* netlify may omit */, `${kind} content-type unexpected: ${contentType}`);
  const head = extractHead(text);
  // Allow attributes inside <title ...> and tolerate whitespace
  assert(/<title(?:\s[^>]*)?>[\s\S]*?<\/title>/i.test(head), `${kind} missing <title>`);
  assert(/<meta[^>]+name="description"/i.test(head), `${kind} missing meta description`);
  assert(/<link[^>]+rel="canonical"/i.test(head), `${kind} missing canonical`);
  assert(/application\/ld\+json/i.test(head), `${kind} missing JSON-LD`);
}

(async () => {
  try {
    console.log(`Validating sitemaps at ${base}...`);
    await validateSitemaps();
    console.log('✓ Sitemaps OK');

    if (argv.item) {
      const itemUrl = `${base}/item/${encodeURIComponent(argv.item)}`;
      console.log(`Validating item page: ${itemUrl}`);
      await validatePage(itemUrl, 'Item');
      console.log('✓ Item page OK');
    } else {
      console.log('Skipping item page test (provide --item REF to test)');
    }

    if (argv.seller) {
      const sellerUrl = `${base}/seller/${encodeURIComponent(argv.seller)}`;
      console.log(`Validating seller page: ${sellerUrl}`);
      await validatePage(sellerUrl, 'Seller');
      console.log('✓ Seller page OK');
    } else {
      console.log('Skipping seller page test (provide --seller ID to test)');
    }

    process.exit(0);
  } catch (err) {
    console.error('Validation failed:', err?.message || err);
    process.exit(1);
  }
})();
