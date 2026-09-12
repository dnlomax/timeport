import { NextResponse } from "next/server";
import { panoAhead } from "@/lib/streetview";

export const dynamic = "force-dynamic";

// Street View drops coverage at junctions and pedestrian areas, so a miss at
// the asked-for step is retried further out before giving up.
const RETRY_FACTORS = [1, 1.8, 3];

// POST { lat, lng, heading, step, exclude? }
// → the next outdoor panorama along that heading, aimed the same way.
export async function POST(request: Request) {
  const { lat, lng, heading, step, exclude } = (await request.json()) as {
    lat?: number;
    lng?: number;
    heading?: number;
    step?: number;
    exclude?: string;
  };
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    typeof heading !== "number" ||
    typeof step !== "number"
  ) {
    return NextResponse.json(
      { error: "lat, lng, heading and step are required" },
      { status: 400 },
    );
  }

  try {
    for (const factor of RETRY_FACTORS) {
      const pano = await panoAhead(
        { lat, lng },
        heading,
        step * factor,
        exclude,
      );
      if (pano) {
        return NextResponse.json(pano, {
          headers: { "Cache-Control": "private, no-store" },
        });
      }
    }
    return NextResponse.json(
      { error: "No Street View coverage further along this street" },
      { status: 404 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Lookup failed" },
      { status: 502 },
    );
  }
}
