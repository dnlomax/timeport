// The one object the app passes around: a place, an era, and the two prompts
// that keep the world model and the live filter describing the same decade.

export interface PanoLookup {
  panoId: string;
  pano: { lat: number; lng: number };
  target: { lat: number; lng: number };
  heading: number;
  address: string;
  captured?: string;
  copyright?: string;
}

export interface Scene {
  eraId: string;
  eraLabel: string;
  place: PanoLookup;
  /** Untouched Street View frame, served through our proxy. */
  beforeUrl: string;
  /** Period-restyled seed frame as a data URL. */
  afterUrl: string;
  /** The seed frame carries the era already, so the world needs no filter. */
  aged?: boolean;
  worldPrompt: string;
  liveEditPrompt: string;
}

export function panoImageSrc(place: PanoLookup): string {
  const params = new URLSearchParams({
    pano: place.panoId,
    heading: place.heading.toFixed(2),
  });
  return `/api/streetview/image?${params}`;
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}
