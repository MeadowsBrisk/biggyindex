#!/usr/bin/env node
import { runIndexMarket } from "./run";

const args = process.argv.slice(2);
let market = (process.env.MARKET || "GB").toUpperCase();
for (let i = 0; i < args.length; i++) {
  if ((args[i] === "--market" || args[i] === "-m") && args[i + 1]) {
    market = String(args[i + 1]).toUpperCase();
  }
}

(async () => {
  try {
    const res = await runIndexMarket(market as any);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.ok ? 0 : 1);
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error(e?.stack || e?.message || String(e));
    process.exit(1);
  }
})();
