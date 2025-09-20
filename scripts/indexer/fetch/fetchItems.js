// Fetch items from configured endpoints with cookie jar warming.
// Uses http-cookie-agent to attach a tough-cookie jar to axios.
const axios = require('axios');

async function fetchItemsFromEndpoints(endpoints) {
	const [{ CookieJar }, httpMod] = await Promise.all([
		import('tough-cookie'),
		import('http-cookie-agent/http')
	]);
	const { HttpCookieAgent, HttpsCookieAgent } = httpMod;
	const jar = new CookieJar();
	const client = axios.create({
		httpAgent: new HttpCookieAgent({ cookies: { jar } }),
		httpsAgent: new HttpsCookieAgent({ cookies: { jar } }),
		withCredentials: true,
		timeout: 30000,
		headers: {
			'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
			Accept: 'application/json, text/plain, */*',
			'Accept-Language': 'en-GB,en;q=0.9',
			Referer: 'https://littlebiggy.net/',
			Origin: 'https://littlebiggy.net',
			'X-Requested-With': 'XMLHttpRequest',
		},
		validateStatus: (status) => status >= 200 && status < 300,
	});

	let items = null;
	let sellerReviewSummaries = null;
	let itemReviewSummaries = null;
	let lastError = null;
	for (const url of endpoints) {
		try {
			const warmUrl = url.includes('/core/api/') ? url.replace('/core/api/', '/').split('?')[0] : url.split('?')[0];
			try { await client.get(warmUrl, { responseType: 'text' }); } catch {}
			const response = await client.get(url, { responseType: 'json' });
			const message = response?.data?.data?.message || response?.data?.message || response?.data;
			const candidateItems = message?.items;
			if (Array.isArray(candidateItems)) {
				items = candidateItems;
				sellerReviewSummaries = message?.sellerReviewSummaries || null;
				itemReviewSummaries = message?.itemReviewSummaries || null;
				console.log(`Fetched ${items.length} items from ${url}`);
				break;
			}
			lastError = new Error('Unexpected response structure');
		} catch (err) {
			lastError = err;
			continue;
		}
	}
	if (!Array.isArray(items)) throw lastError || new Error('Failed to fetch items from all endpoints');
	return { items, sellerReviewSummaries, itemReviewSummaries };
}

module.exports = { fetchItemsFromEndpoints };
