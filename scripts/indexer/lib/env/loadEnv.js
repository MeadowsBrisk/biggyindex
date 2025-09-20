// Local development .env loader (only loads NETLIFY_* style vars if all missing)
function loadIndexerEnv() {
	try {
		const need = ['NETLIFY_SITE_ID','NETLIFY_API_TOKEN','NETLIFY_BLOBS_TOKEN','NETLIFY_AUTH_TOKEN'];
		const missing = need.filter(k => !process.env[k]);
		if (missing.length === need.length) {
			const fs = require('fs');
			const path = require('path');
			const envPath = path.join(process.cwd(), '.env');
			if (fs.existsSync(envPath)) {
				const lines = fs.readFileSync(envPath,'utf8').split(/\r?\n/);
				for (const line of lines) {
					if (!line || line.startsWith('#')) continue;
					const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
					if (!m) continue;
					const key = m[1];
						if (process.env[key]) continue;
						let val = m[2];
						if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
							val = val.slice(1,-1);
						}
						process.env[key] = val;
				}
				if (process.env.NETLIFY_SITE_ID && process.env.NETLIFY_API_TOKEN) {
					console.log('[dotenv] Loaded NETLIFY_* vars from .env for local run');
				}
			}
		}
	} catch (_) {
		// silent
	}
}

module.exports = { loadIndexerEnv };
