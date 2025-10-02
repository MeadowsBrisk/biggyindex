const API_ENDPOINT = '/api/index/sellers';
const STATIC_ENDPOINT = '/sellers.json';

let sellersByName = null;
let sellersById = null;
let loadPromise = null;

const normaliseName = (name) => {
  if (typeof name !== 'string' || !name) return '';
  return name.trim().toLowerCase();
};

function buildIndexes(list) {
  const byName = new Map();
  const byId = new Map();
  if (Array.isArray(list)) {
    for (const entry of list) {
      if (!entry || typeof entry !== 'object') continue;
      if (entry.name) byName.set(normaliseName(entry.name), entry);
      if (entry.id != null) byId.set(String(entry.id), entry);
    }
  }
  sellersByName = byName;
  sellersById = byId;
}

async function fetchSellersList() {
  let list = [];
  try {
    const resApi = await fetch(API_ENDPOINT, { cache: 'no-store' });
    if (resApi && resApi.ok) {
      const json = await resApi.json();
      if (Array.isArray(json?.sellers)) list = json.sellers;
    }
  } catch {}
  if (!Array.isArray(list) || list.length === 0) {
    try {
      const resStatic = await fetch(STATIC_ENDPOINT, { cache: 'force-cache' });
      if (resStatic && resStatic.ok) {
        const json = await resStatic.json();
        if (Array.isArray(json)) list = json;
        else if (Array.isArray(json?.sellers)) list = json.sellers;
      }
    } catch {}
  }
  return list;
}

export async function loadSellersIndex() {
  if (sellersByName && sellersById) {
    return { byName: sellersByName, byId: sellersById };
  }
  if (!loadPromise) {
    loadPromise = (async () => {
      const list = await fetchSellersList();
      buildIndexes(list);
      return { byName: sellersByName, byId: sellersById };
    })().catch((err) => {
      loadPromise = null;
      throw err;
    });
  }
  return loadPromise;
}

export function getCachedSellerByName(name) {
  if (!sellersByName) return null;
  return sellersByName.get(normaliseName(name)) || null;
}

export function getCachedSellerById(id) {
  if (!sellersById) return null;
  if (id == null) return null;
  return sellersById.get(String(id)) || null;
}
