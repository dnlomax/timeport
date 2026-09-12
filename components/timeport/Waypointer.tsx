"use client";

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { SeedAger } from "./SeedAger";
import { panoImageSrc, type PanoLookup, type Scene } from "@/lib/scene";
import { walk } from "@/lib/walk";

// Keeps the walk on real streets. LingBot only ever sees one image, and every
// metre past it is invention, so the walk is broken into legs: dead reckoning
// says roughly how far the camera has gone, and at the end of each leg the
// world is re-seeded with the Street View panorama that actually stands there.
//
// The model fills in the metres between panoramas, which is the point — real
// geometry at the waypoints, generated continuity in between.

export const STEP_METRES = 18;
// Fetch the next panorama (and age it) while the current leg is still running,
// so the hand-over is a seed swap rather than a wait.
const PREFETCH_AT = 0.5;
const POLL_MS = 500;
// How long a leg will wait for SANA to age the next seed before going ahead
// with the plain frame.
const AGE_GRACE_MS = 30_000;
const MISS_COOLDOWN_MS = 10_000;

interface Props {
  scene: Scene;
  onAnchor: (place: PanoLookup, seed: string) => Promise<void>;
  onNote: (note: string | null) => void;
}

export function Waypointer({ scene, onAnchor, onNote }: Props) {
  const [next, setNext] = useState<PanoLookup | null>(null);
  const [seed, setSeed] = useState<string | null>(null);

  // The poll runs off one interval for the life of the walk, so everything it
  // touches goes through a ref rather than the closure it was created with.
  const now = {
    scene,
    next,
    seed,
    onAnchor,
    onNote,
  };
  const latest = useRef({
    ...now,
    fetching: false,
    anchoring: false,
    askedAt: 0,
    blockedUntil: 0,
  });
  Object.assign(latest.current, now);

  useEffect(() => {
    const id = setInterval(() => void tick(latest, setNext, setSeed), POLL_MS);
    return () => clearInterval(id);
  }, []);

  // Aged worlds age every waypoint too, otherwise the walk would step from a
  // 1920s street into a photograph of today.
  const ageing = !!scene.aged && !!next && !seed;

  return (
    <SeedAger
      active={ageing}
      src={next ? panoImageSrc(next) : ""}
      prompt={scene.liveEditPrompt}
      onFrame={setSeed}
      onError={() => setSeed(next ? panoImageSrc(next) : null)}
    />
  );
}

type Poll = MutableRefObject<
  Props & {
    next: PanoLookup | null;
    seed: string | null;
    fetching: boolean;
    anchoring: boolean;
    askedAt: number;
    blockedUntil: number;
  }
>;

async function tick(
  latest: Poll,
  setNext: (place: PanoLookup | null) => void,
  setSeed: (seed: string | null) => void,
) {
  const self = latest.current;
  if (self.anchoring || self.fetching) return;
  if (Date.now() < self.blockedUntil) return;

  const { metres, heading } = walk.sample();
  if (metres < STEP_METRES * PREFETCH_AT) return;

  if (!self.next) {
    self.fetching = true;
    try {
      const res = await fetch("/api/next-pano", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: self.scene.place.pano.lat,
          lng: self.scene.place.pano.lng,
          heading,
          step: STEP_METRES,
          exclude: self.scene.place.panoId,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        // Dead end or a gap in coverage: keep generating and try again once
        // the walk (or the user's heading) has moved on.
        self.blockedUntil = Date.now() + MISS_COOLDOWN_MS;
        self.onNote(body.error ?? "No panorama ahead");
        return;
      }
      self.askedAt = Date.now();
      setNext(body as PanoLookup);
    } catch {
      self.blockedUntil = Date.now() + MISS_COOLDOWN_MS;
    } finally {
      self.fetching = false;
    }
    return;
  }

  if (metres < STEP_METRES) return;
  // Let the ageing pass finish if it still can; the leg simply runs long.
  const waitingOnAge =
    self.scene.aged && !self.seed && Date.now() - self.askedAt < AGE_GRACE_MS;
  if (waitingOnAge) return;

  const place = self.next;
  self.anchoring = true;
  self.onNote(null);
  try {
    await self.onAnchor(place, self.seed ?? panoImageSrc(place));
  } finally {
    // Whatever happened, the next leg is measured from here.
    walk.reset(place.heading);
    setNext(null);
    setSeed(null);
    self.anchoring = false;
  }
}
