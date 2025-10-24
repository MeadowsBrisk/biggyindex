// Cookie jar load/save using tough-cookie JSON serialization and Netlify Blobs (with FS fallback)
import { loadEnv } from "../env/loadEnv";
import { getBlobClient } from "../persistence/blobs";
import { Keys } from "../persistence/keys";

export type CookieJarLike = {
  toJSON: () => any;
};

export async function loadCookieJar(): Promise<any | null> {
  const env = loadEnv();
  const client = getBlobClient(env.stores.shared);
  const key = Keys.shared.cookies();
  try {
    const data = await client.getJSON<any>(key);
    if (!data) return null;
    const { CookieJar } = await import("tough-cookie");
    const jar = CookieJar.fromJSON(data);
    return jar;
  } catch {
    return null;
  }
}

export async function saveCookieJar(jar: CookieJarLike | null | undefined): Promise<boolean> {
  if (!jar || typeof jar.toJSON !== "function") return false;
  const env = loadEnv();
  const client = getBlobClient(env.stores.shared);
  const key = Keys.shared.cookies();
  try {
    const json = jar.toJSON();
    await client.putJSON(key, json);
    return true;
  } catch {
    return false;
  }
}
