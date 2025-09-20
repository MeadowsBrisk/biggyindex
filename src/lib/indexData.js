import fs from 'fs';
import path from 'path';

// Centralized access to index data (items, manifest, category chunks, sellers, seen) with
// priority: Netlify Blobs (fresh) -> local filesystem (build-time snapshot) -> empty fallback.
// All functions return plain JS objects/arrays (never throw) to simplify API routes.

let blobStorePromise = null;
async function getStoreSafe() {
  if (blobStorePromise) return blobStorePromise;
  try {
    const { getStore } = await import('@netlify/blobs');
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID || process.env.BLOBS_SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN || process.env.BLOBS_TOKEN;
    let store = null;
    if (siteID && token) {
      try { store = getStore({ name: 'site-index', siteID, token, consistency: 'strong' }); } catch {}
    }
    if (!store) {
      try { store = getStore({ name: 'site-index', consistency: 'strong' }); } catch {}
    }
    blobStorePromise = store;
    return blobStorePromise;
  } catch (e) {
    return null; // running locally without blobs or dependency missing
  }
}

async function readBlobJSON(key) {
  const store = await getStoreSafe();
  if (!store) return null;
  try {
    const value = await store.get(key);
    if (!value) return null;
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function readFsJSON(rel) {
  try {
    const full = path.join(process.cwd(), 'public', rel);
    if (!fs.existsSync(full)) return null;
    return JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch {
    return null;
  }
}

export async function getManifest() {
  return (await readBlobJSON('data/manifest.json')) || readFsJSON('data/manifest.json') || { categories: {}, totalItems: 0 };
}

export async function getAllItems() {
  const strict = /^1|true|yes|on|strict$/i.test(String(process.env.REQUIRE_BLOBS_FRONTEND || ''));
  const blob = await readBlobJSON('indexed_items.json');
  if (blob) return blob;
  if (strict) return [];
  return readFsJSON('indexed_items.json') || [];
}

export async function getSellers() {
  const strict = /^1|true|yes|on|strict$/i.test(String(process.env.REQUIRE_BLOBS_FRONTEND || ''));
  const blob = await readBlobJSON('sellers.json');
  if (blob) return blob;
  if (strict) return [];
  return readFsJSON('sellers.json') || [];
}

export async function getCategoryItems(categoryName) {
  if (!categoryName) return [];
  const key = `data/items-${categoryName.toLowerCase()}.json`;
  const strict = /^1|true|yes|on|strict$/i.test(String(process.env.REQUIRE_BLOBS_FRONTEND || ''));
  const blob = await readBlobJSON(key);
  if (blob) return blob;
  if (strict) return [];
  return readFsJSON(key) || [];
}

export async function getSeenMap() {
  return (await readBlobJSON('seen.json')) || {}; // not stored in public
}

export async function getItemIdSet() {
  const items = await getAllItems();
  return new Set(items.map(i => i && i.id).filter(Boolean));
}

export async function getSnapshotMeta() {
  const strict = /^1|true|yes|on|strict$/i.test(String(process.env.REQUIRE_BLOBS_FRONTEND || ''));
  const blob = await readBlobJSON('snapshot_meta.json');
  if (blob) return blob;
  if (strict) return null;
  return readFsJSON('snapshot_meta.json') || null;
}
