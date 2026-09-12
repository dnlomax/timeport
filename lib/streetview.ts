// Server-only Street View + Geocoding helpers. The Maps key never leaves the
// server: the browser talks to /api/locate and /api/streetview/image.
//
// Note on terms: Google's Maps Platform terms forbid caching or deriving from
// Street View imagery, so nothing here writes an image to disk — panoramas are
// fetched per request, passed through, and dropped. Panorama IDs are the one
// field exempt from the caching restriction.

const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const SV_METADATA_URL =
  "https://maps.googleapis.com/maps/api/streetview/metadata";
const SV_IMAGE_URL = "https://maps.googleapis.com/maps/api/streetview";

// 640x640 is the hard cap of the Street View Static API's free tier, and 16:9
// matches what the world model wants as a seed frame.
export const SEED_WIDTH = 640;
export const SEED_HEIGHT = 360;

export interface LatLng {
  lat: number;
  lng: number;
}

export interface PanoLocation {
  panoId: string;
  /** Where the camera actually stood, which is not the geocoded address. */
  pano: LatLng;
  /** The geocoded address the user asked for. */
  target: LatLng;
  /** Camera bearing that points from the pano at the geocoded address. */
  heading: number;
  address: string;
  /** Capture date of the panorama, e.g. "2023-07". */
  captured?: string;
  copyright?: string;
}

export function mapsKey(): string {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error("GOOGLE_MAPS_API_KEY is not set on the server");
  return key;
}

const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

/** Initial great-circle bearing from `from` to `to`, in degrees clockwise from north. */
export function bearing(from: LatLng, to: LatLng): number {
  const dLng = toRad(to.lng - from.lng);
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export async function geocode(
  query: string,
): Promise<{ location: LatLng; address: string }> {
  const url = `${GEOCODE_URL}?address=${encodeURIComponent(query)}&key=${mapsKey()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Geocoding API returned ${res.status}`);
  const body = (await res.json()) as {
    status: string;
    error_message?: string;
    results: {
      formatted_address: string;
      geometry: { location: LatLng };
    }[];
  };
  if (body.status === "ZERO_RESULTS") {
    throw new Error(`No place matched "${query}"`);
  }
  if (body.status !== "OK") {
    throw new Error(body.error_message ?? `Geocoding failed: ${body.status}`);
  }
  const top = body.results[0];
  return { location: top.geometry.location, address: top.formatted_address };
}

/**
 * Find the Street View panorama nearest a place and aim it at that place.
 * `radius` is metres; outdoor panoramas only, so we never seed the world model
 * with the inside of a shop.
 */
export async function nearestPano(
  query: string,
  radius = 100,
): Promise<PanoLocation> {
  const { location, address } = await geocode(query);
  const url =
    `${SV_METADATA_URL}?location=${location.lat},${location.lng}` +
    `&radius=${radius}&source=outdoor&key=${mapsKey()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Street View metadata returned ${res.status}`);
  const body = (await res.json()) as {
    status: string;
    pano_id?: string;
    location?: LatLng;
    date?: string;
    copyright?: string;
  };
  if (body.status !== "OK" || !body.pano_id || !body.location) {
    throw new Error(
      `No Street View coverage within ${radius}m of ${address} (${body.status})`,
    );
  }
  const heading = bearing(body.location, location);
  return {
    panoId: body.pano_id,
    pano: body.location,
    target: location,
    // A pano sitting right on top of its target gives a meaningless bearing.
    heading: Number.isFinite(heading) ? heading : 0,
    address,
    captured: body.date,
    copyright: body.copyright,
  };
}

const EARTH_RADIUS_M = 6_371_000;

/** The point `metres` away from `from` along `bearingDeg`. */
export function destination(
  from: LatLng,
  bearingDeg: number,
  metres: number,
): LatLng {
  const d = metres / EARTH_RADIUS_M;
  const brg = toRad(bearingDeg);
  const lat1 = toRad(from.lat);
  const lng1 = toRad(from.lng);
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brg),
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(brg) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    );
  return { lat: toDeg(lat2), lng: toDeg(lng2) };
}

/**
 * The next outdoor panorama `step` metres along `heading`, keeping the walking
 * direction as the camera bearing so the new frame carries on from the old one.
 * Returns null where Street View has no coverage that way.
 */
export async function panoAhead(
  from: LatLng,
  heading: number,
  step: number,
  exclude?: string,
): Promise<PanoLocation | null> {
  // Panoramas sit ~10m apart on a typical street, so a radius under half the
  // step keeps the search from snapping back to the one we started on.
  const radius = Math.max(step / 2, 15);
  const target = destination(from, heading, step);
  const url =
    `${SV_METADATA_URL}?location=${target.lat},${target.lng}` +
    `&radius=${radius}&source=outdoor&key=${mapsKey()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Street View metadata returned ${res.status}`);
  const body = (await res.json()) as {
    status: string;
    pano_id?: string;
    location?: LatLng;
    date?: string;
    copyright?: string;
  };
  if (body.status !== "OK" || !body.pano_id || !body.location) return null;
  if (body.pano_id === exclude) return null;
  return {
    panoId: body.pano_id,
    pano: body.location,
    target,
    heading,
    address: "",
    captured: body.date,
    copyright: body.copyright,
  };
}

export interface PanoImageOptions {
  panoId: string;
  heading: number;
  pitch?: number;
  fov?: number;
}

export function panoImageUrl({
  panoId,
  heading,
  pitch = 0,
  fov = 90,
}: PanoImageOptions): string {
  const params = new URLSearchParams({
    pano: panoId,
    size: `${SEED_WIDTH}x${SEED_HEIGHT}`,
    heading: heading.toFixed(2),
    pitch: pitch.toFixed(2),
    fov: fov.toFixed(2),
    return_error_code: "true",
    key: mapsKey(),
  });
  return `${SV_IMAGE_URL}?${params}`;
}

export async function fetchPanoImage(
  options: PanoImageOptions,
): Promise<{ bytes: Buffer; contentType: string }> {
  const res = await fetch(panoImageUrl(options), { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Street View image returned ${res.status}`);
  }
  return {
    bytes: Buffer.from(await res.arrayBuffer()),
    contentType: res.headers.get("content-type") ?? "image/jpeg",
  };
}
