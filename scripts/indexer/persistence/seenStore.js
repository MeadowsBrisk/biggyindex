const fs = require('fs');
const path = require('path');

async function getBlobsStore() {
	try {
		const { getStore } = await import('@netlify/blobs');
		try {
			return getStore({ name: 'site-index' });
		} catch (e1) {
			const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID || process.env.BLOBS_SITE_ID;
			const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN || process.env.BLOBS_TOKEN;
			if (siteID && token) {
				try { return getStore({ name: 'site-index', siteID, token }); } catch (e2) { console.warn('[site-index] Blobs explicit fallback failed:', e2.message); }
			} else {
				console.warn('[site-index] Blobs implicit context missing; provide NETLIFY_SITE_ID + NETLIFY_API_TOKEN to enable manual fallback');
			}
			return null;
		}
	} catch (e) {
		console.warn('[site-index] Blobs module import failed:', e.message);
		return null;
	}
}

async function loadSeen({ IS_FUNCTION, RUNTIME_WRITABLE_ROOT }) {
	const scriptsDataDir = IS_FUNCTION ? path.join(RUNTIME_WRITABLE_ROOT, 'scripts', 'data') : path.join(process.cwd(), 'scripts', 'data');
	const seenPath = path.join(scriptsDataDir, 'seen.json');
	let seen = {};
	let loadedFromBlob = false;
	let repoSeenPresent = false;
	let baselineSeeding = false;
	let merged = false;
	try {
		const repoSeenPath = path.join(process.cwd(), 'scripts', 'data', 'seen.json');
		if (fs.existsSync(repoSeenPath)) {
			seen = JSON.parse(fs.readFileSync(repoSeenPath, 'utf8')) || {};
			repoSeenPresent = Object.keys(seen).length > 0;
			console.log('[seen] Loaded repo baseline with', Object.keys(seen).length, 'entries');
		}
	} catch (e) { console.warn('[seen] Failed loading repo baseline:', e.message); }
	let store = null;
	try {
		store = await getBlobsStore();
		if (store) {
			const blobRaw = await store.get('seen.json');
			if (blobRaw) {
				const blobSeen = JSON.parse(blobRaw) || {};
				loadedFromBlob = true;
				let mergedAdded = 0, mergedUpdated = 0;
				for (const [id, rec] of Object.entries(blobSeen)) {
					if (!rec || typeof rec !== 'object') continue;
						if (!seen[id]) { seen[id] = rec; mergedAdded++; continue; }
						const cur = seen[id];
						let changed = false;
						if (rec.firstSeenAt && (!cur.firstSeenAt || rec.firstSeenAt < cur.firstSeenAt)) { cur.firstSeenAt = rec.firstSeenAt; changed = true; }
						if (rec.lastUpdatedAt && (!cur.lastUpdatedAt || rec.lastUpdatedAt > cur.lastUpdatedAt)) { cur.lastUpdatedAt = rec.lastUpdatedAt; changed = true; }
						if (rec.sig && !cur.sig) { cur.sig = rec.sig; changed = true; }
						if (changed) mergedUpdated++;
				}
				console.log('[seen] Merged blob snapshot: +' + mergedAdded + ' new, ' + mergedUpdated + ' updated');
				if (mergedAdded || mergedUpdated) merged = true;
			} else {
				if (repoSeenPresent) baselineSeeding = true;
				console.log('[seen] No existing blob seen.json; will seed from repo baseline');
				try { await store.set('seen.json', JSON.stringify(seen)); console.log('[seen] Seeded initial seen.json to blob store (baseline)'); } catch (seedErr) { console.warn('[seen] Failed to seed initial blob seen.json:', seedErr.message); }
			}
		} else {
			console.log('[seen] Blob store unavailable (cannot merge existing snapshot)');
		}
	} catch (e) { console.warn('[seen] Blob merge failed:', e.message); }

	// Normalize legacy forms
	const out = {};
	for (const [key, val] of Object.entries(seen || {})) {
		if (val && typeof val === 'object') {
			out[key] = { firstSeenAt: val.firstSeenAt || val.firstSeen || null, lastUpdatedAt: val.lastUpdatedAt ?? null, sig: val.sig || null };
		} else if (typeof val === 'string') {
			out[key] = { firstSeenAt: val, lastUpdatedAt: null, sig: null };
		}
	}
	seen = out;
	return { seen, store, scriptsDataDir, seenPath, loadedFromBlob, baselineSeeding, merged };
}

async function persistSeen(store, seen, { loadedFromBlob, merged }) {
	if (!store) return;
	try {
		if (merged && loadedFromBlob) {
			try {
				const already = await store.get('seen.migration.done');
				if (!already) {
					await store.set(`seen.backup.${Date.now()}.json`, JSON.stringify(seen));
					await store.set('seen.migration.done', new Date().toISOString());
					console.log('[migration] Backed up merged seen snapshot to blobs (seen.backup.*)');
				}
			} catch (e) { console.warn('[migration] Backup attempt failed:', e.message); }
		}
		await store.set('seen.json', JSON.stringify(seen));
	} catch (e) { console.warn('[seen] persistence failed:', e.message); }
}

module.exports = { loadSeen, persistSeen, getBlobsStore };
