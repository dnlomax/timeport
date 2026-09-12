import { NextResponse } from "next/server";
import { routeAhead } from "@/lib/streetview";

export const dynamic = "force-dynamic";

const MAX_STOPS = 16;

// POST { lat, lng, heading, step, count }
// → the panoramas a walk down this street actually passes, in order.
export async function POST(request: Request) {
  const { lat, lng, heading, step, count } = (await request.json()) as {
    lat?: number;
    lng?: number;
    heading?: number;
    step?: number;
    count?: number;
  };
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    typeof heading !== "number"
  ) {
    return NextResponse.json(
      { error: "lat, lng and heading are required" },
      { status: 400 },
    );
  }

  try {
    const stops = await routeAhead(
      { lat, lng },
      heading,
      step ?? 20,
      Math.min(count ?? 6, MAX_STOPS),
    );
    if (!stops.length) {
      return NextResponse.json(
        { error: "No Street View coverage along this street" },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { stops },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Lookup failed" },
      { status: 502 },
    );
  }
}
