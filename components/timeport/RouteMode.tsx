"use client";

import { useState } from "react";
import { FastH3Provider } from "@reactor-models/fast-h3";
import { Button } from "@/components/ui/button";
import { RouteWalk } from "./RouteWalk";
import { REACTOR_API_URL, fastH3Token } from "@/lib/reactor-token";
import type { PanoLookup, Scene } from "@/lib/scene";

// Plans the route — the real panoramas the walk will pass through — and hands
// them to the clip model. The walk itself lives in RouteWalk.
//
// The provider is mounted for the app's life and only the walk inside it comes
// and goes: a provider that mounts on demand disposes its Reactor on React's
// double-mount, and everything after that fails with "Reactor was disposed".
// Nothing below it may use a LingBot hook — the nearest provider wins.

export function RouteMode({ scene }: { scene: Scene | null }) {
  return (
    <FastH3Provider apiUrl={REACTOR_API_URL} jwtToken={fastH3Token}>
      <RoutePlanner scene={scene} />
    </FastH3Provider>
  );
}

const STOPS = 8;
const STEP_METRES = 20;

function RoutePlanner({ scene }: { scene: Scene | null }) {
  const [stops, setStops] = useState<PanoLookup[] | null>(null);
  const [ageStills, setAgeStills] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function plan() {
    if (!scene) return;
    setError(null);
    setPlanning(true);
    try {
      const res = await fetch("/api/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: scene.place.pano.lat,
          lng: scene.place.pano.lng,
          heading: scene.place.heading,
          step: STEP_METRES,
          count: STOPS,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not plan the route");
      setStops([scene.place, ...(body.stops as PanoLookup[])]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not plan the route");
    } finally {
      setPlanning(false);
    }
  }

  if (!scene) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-white/[0.08] bg-black text-sm text-zinc-500">
        Find a place first.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {stops ? (
        <RouteWalk
          key={stops.map((s) => s.panoId).join()}
          scene={scene}
          stops={stops}
          ageStills={ageStills}
          onError={setError}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-black px-6 text-center">
          <p className="text-sm text-zinc-400">
            Walks {STOPS} real Street View panoramas down this street, ~
            {STEP_METRES}m apart, generating the stretch between each pair.
          </p>
          <p className="text-xs text-zinc-600">
            Every waypoint is real geometry; the walking is generated. Clips are
            built ahead of playback, so the route plays rather than steers.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400">
        <Button size="sm" onClick={stops ? () => setStops(null) : plan} disabled={planning}>
          {stops ? "Stop" : planning ? "Planning…" : "Walk this street"}
        </Button>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={ageStills}
            onChange={(e) => setAgeStills(e.target.checked)}
            disabled={!!stops}
            className="size-3.5 accent-primary"
          />
          Age each waypoint through SANA
          <span className="text-zinc-600">
            (period content, not just grade — slower)
          </span>
        </label>
        {error && <span className="text-red-400">{error}</span>}
      </div>
    </div>
  );
}
