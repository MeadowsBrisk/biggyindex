import { Inngest } from "inngest";

// Inngest client for unified crawler orchestration
// In production/staging, the event key enables Cloud mode.
// In local dev, omit the event key so Dev mode is used.
export const inngest = new Inngest({
  id: "biggyindex-unified-crawler",
  eventKey: process.env.INNGEST_EVENT_KEY,
});
