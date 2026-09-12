import { NextResponse } from "next/server";
import { nearestPano } from "@/lib/streetview";

export const dynamic = "force-dynamic";

// POST { query: "Lisbon, Portugal" }
// → the nearest outdoor panorama, aimed at the geocoded place.
export async function POST(request: Request) {
  const { query } = (await request.json()) as { query?: string };
  if (!query?.trim()) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  try {
    const pano = await nearestPano(query.trim());
    return NextResponse.json(pano, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Lookup failed" },
      { status: 502 },
    );
  }
}
