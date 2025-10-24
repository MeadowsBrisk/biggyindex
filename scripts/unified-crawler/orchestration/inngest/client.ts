import { Inngest } from "inngest";

// Inngest client for unified crawler orchestration
// Explicitly determine if we're in local dev or cloud based on environment
const isLocalDev =
  process.env.NETLIFY_DEV === "true" ||
  process.env.INNGEST_DEV === "1" ||
  process.env.NODE_ENV === "development";

// In production/staging, use Cloud mode with event key.
// In local dev, use Dev mode without event key.
export const inngest = new Inngest({
  id: "biggyindex-unified-crawler",
  eventKey: isLocalDev ? undefined : process.env.INNGEST_EVENT_KEY,
  // Explicitly set isDev to force the correct mode
  isDev: isLocalDev,
});
