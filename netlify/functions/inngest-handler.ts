import { serve } from "inngest/lambda";
import { functions } from "../../scripts/unified-crawler/orchestration/inngest/handlers";
import { inngest } from "../../scripts/unified-crawler/orchestration/inngest/client";

// Only enable Dev-specific options (signingKey/serveHost) when running locally.
// In staging/production, omit these so the handler serves in Cloud mode and can be registered.
const isLocalDev =
	process.env.NETLIFY_DEV === "true" ||
	process.env.INNGEST_DEV === "1" ||
	process.env.NODE_ENV === "development";

const devConfig: any = isLocalDev
	? {
			client: inngest,
			functions,
			// Help Inngest Dev discover the correct local path behind Netlify Functions
			servePath: "/.netlify/functions/inngest-handler",
			signingKey: process.env.INNGEST_SIGNING_KEY,
			serveHost: process.env.INNGEST_SERVE_HOST,
			mode: "dev",
		}
	: {
			client: inngest,
			functions,
			// In Cloud mode, omit dev-only options entirely
			mode: "cloud",
		};

export const handler = serve(devConfig);
