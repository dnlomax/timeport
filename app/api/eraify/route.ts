import { NextResponse } from "next/server";
import { eraById } from "@/lib/eras";
import { eraifyImage } from "@/lib/eraify";
import { fetchPanoImage } from "@/lib/streetview";

export const dynamic = "force-dynamic";
// The image edit takes longer than the platform's default budget.
export const maxDuration = 120;

// POST { panoId, heading, era } → the same view, restyled into the era.
export async function POST(request: Request) {
  const { panoId, heading, pitch, fov, era } = (await request.json()) as {
    panoId?: string;
    heading?: number;
    pitch?: number;
    fov?: number;
    era?: string;
  };
  if (!panoId) {
    return NextResponse.json({ error: "panoId is required" }, { status: 400 });
  }

  const preset = eraById(era ?? "");
  try {
    const source = await fetchPanoImage({
      panoId,
      heading: heading ?? 0,
      pitch: pitch ?? 0,
      fov: fov ?? 90,
    });
    const restyled = await eraifyImage(source, preset.restyle);
    return NextResponse.json(
      {
        era: preset.id,
        image: restyled.dataUrl,
        note: restyled.note,
        worldPrompt: preset.world,
        liveEditPrompt: preset.liveEdit,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Restyle failed" },
      { status: 502 },
    );
  }
}
