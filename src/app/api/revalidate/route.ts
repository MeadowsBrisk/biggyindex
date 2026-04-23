import { type NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

interface RevalidatePayload {
  secret?: string;
  tag?: string;
  tags?: string[];
}

/**
 * POST /api/revalidate?tag=items
 *
 * On-demand ISR cache bust. Called after a crawl completes.
 * Validates a shared secret to prevent abuse.
 *
 * Pattern from: food-aggregator-example/app/api/revalidate/route.ts
 */
export async function POST(request: NextRequest) {
  let payload: RevalidatePayload = {};

  try {
    payload = (await request.json()) as RevalidatePayload;
  } catch {
    payload = {};
  }

  const secret =
    request.headers.get("x-revalidation-secret") ?? payload.secret;
  const expectedSecret = process.env.REVALIDATION_SECRET;

  if (!expectedSecret || secret !== expectedSecret) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  }

  const tags = [
    request.nextUrl.searchParams.get("tag"),
    payload.tag,
    ...(Array.isArray(payload.tags) ? payload.tags : []),
  ].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );

  if (tags.length === 0) {
    return NextResponse.json(
      { error: "Missing tag or tags" },
      { status: 400 },
    );
  }

  const validTags = [
    "items",
    "item-detail",
    "sellers",
    "config",
  ];
  const invalidTags = tags.filter((tag) => !validTags.includes(tag));
  if (invalidTags.length > 0) {
    return NextResponse.json(
      { error: `Invalid tag: ${invalidTags.join(", ")}` },
      { status: 400 },
    );
  }

  const tagProfiles: Record<string, string> = {
    items: "items",
    "item-detail": "item-detail",
    sellers: "sellers",
    config: "config",
  };

  for (const tag of tags) {
    revalidateTag(tag, tagProfiles[tag] || "config");
  }

  return NextResponse.json({ revalidated: true, tags, now: Date.now() });
}
