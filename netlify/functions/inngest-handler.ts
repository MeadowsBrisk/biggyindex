import { serve } from "inngest/lambda";
import { functions } from "../../scripts/unified-crawler/orchestration/inngest/handlers";
import { inngest } from "../../scripts/unified-crawler/orchestration/inngest/client";

// Only enable Dev-specific options (signingKey/serveHost) when running locally.
// In staging/production, omit these entirely so the SDK auto-detects Cloud mode.
const isLocalDev =
	process.env.NETLIFY_DEV === "true" ||
	process.env.INNGEST_DEV === "1" ||
	process.env.NODE_ENV === "development";

const serveConfig = isLocalDev
	? {
			client: inngest,
			functions,
			// Help Inngest Dev discover the correct local path behind Netlify Functions
			servePath: "/.netlify/functions/inngest-handler",
			signingKey: process.env.INNGEST_SIGNING_KEY,
			serveHost: process.env.INNGEST_SERVE_HOST,
		}
	: {
			client: inngest,
			functions,
			// In Cloud mode, let the SDK auto-detect based on presence of eventKey and signingKey
		};

export const handler = serve(serveConfig);
