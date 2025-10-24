import { serve } from "inngest/lambda";
import { functions } from "../../scripts/unified-crawler/orchestration/inngest/handlers";
import { inngest } from "../../scripts/unified-crawler/orchestration/inngest/client";

export const handler = serve({
	client: inngest,
	functions,
	// Help Inngest Dev discover the correct local path behind Netlify Functions
	servePath: "/.netlify/functions/inngest-handler",
	// Ensure local dev uses a shared signing key between Dev Server and this handler
	signingKey: process.env.INNGEST_SIGNING_KEY,
	// In local Netlify dev, explicitly declare the public host so Inngest can compute full URLs
	serveHost: process.env.INNGEST_SERVE_HOST,
});
