const path = require('path');
const fs = require('fs');
const { getBlobsStore } = require('./seenStore');

async function persistDatasets({ processedItems, sellers, manifest, byCategory, snapshotMeta, storeRef, IS_FUNCTION, seen }) {
	let store = storeRef;
	if (!store) {
		try { store = await getBlobsStore(); } catch {}
	}
	let blobPersisted = false;
	if (store) {
		try {
			await Promise.all([
				store.set('indexed_items.json', JSON.stringify(processedItems)),
				store.set('sellers.json', JSON.stringify(sellers)),
				store.set('data/manifest.json', JSON.stringify(manifest)),
				...Array.from(byCategory.entries()).map(([cat, arr]) => store.set(`data/items-${cat.toLowerCase()}.json`, JSON.stringify(arr))),
				store.set('seen.json', JSON.stringify(seen)),
				store.set('snapshot_meta.json', JSON.stringify(snapshotMeta)),
			]);
			blobPersisted = true;
			console.log('[persist] Datasets persisted to Netlify Blobs (env=' + (IS_FUNCTION ? 'function' : 'build') + ')');
		} catch (e) {
			console.warn('[persist] Blob persistence failed:', e.message);
		}
	} else {
		console.log('[persist] Skipped blob persistence (store not available)');
	}

	if (IS_FUNCTION && !blobPersisted && process.env.NETLIFY_DATABASE_URL) {
		try {
			const { neon } = await import('@netlify/neon');
			const sql = neon();
			await sql`CREATE TABLE IF NOT EXISTS site_index_snapshots ( key text PRIMARY KEY, json jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now() )`;
			const upsert = async (key, obj) => {
				const jsonStr = JSON.stringify(obj);
				await sql`INSERT INTO site_index_snapshots (key, json) VALUES (${key}, ${jsonStr}::jsonb) ON CONFLICT (key) DO UPDATE SET json = EXCLUDED.json, updated_at = now()`;
			};
			await upsert('indexed_items', processedItems);
			await upsert('sellers', sellers);
			await upsert('manifest', manifest);
			await upsert('seen', seen);
			for (const [cat, arr] of byCategory.entries()) {
				await upsert(`cat_${cat.toLowerCase()}`, arr);
			}
			console.log('[persist] Neon fallback snapshots stored');
		} catch (e) {
			console.warn('[persist] Neon fallback persistence failed:', e.message);
		}
	}
}

module.exports = { persistDatasets };
