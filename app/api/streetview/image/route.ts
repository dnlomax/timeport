import { NextResponse } from "next/server";
import { fetchPanoImage } from "@/lib/streetview";

export const dynamic = "force-dynamic";

// GET /api/streetview/image?pano=...&heading=...&pitch=...&fov=...
//
// Pass-through so the browser can show the untouched panorama without ever
// seeing the Maps key. Explicitly no-store: Google's terms forbid caching
// Street View imagery.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const panoId = params.get("pano");
  if (!panoId) {
    return NextResponse.json({ error: "pano is required" }, { status: 400 });
  }

  const num = (name: string, fallback: number) => {
    const raw = params.get(name);
    const parsed = raw === null ? NaN : Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  try {
    const { bytes, contentType } = await fetchPanoImage({
      panoId,
      heading: num("heading", 0),
      pitch: num("pitch", 0),
      fov: num("fov", 90),
    });
    return new NextResponse(new Uint8Array(bytes), {
      headers: { "Content-Type": contentType, "Cache-Control": "no-store" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Street View failed" },
      { status: 502 },
    );
  }
}
