import { Inngest } from "inngest";

// Inngest client for unified crawler orchestration
// Note: In dev, the CLI (dev server) will discover functions served by our Netlify handler.
export const inngest = new Inngest({ id: "biggyindex-unified-crawler" });
