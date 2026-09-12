"use client";

import { useEffect, useRef, useState } from "react";
import {
  LingbotWorld2MainVideoView,
  useLingbotWorld2,
  useLingbotWorld2Track,
} from "@reactor-models/lingbot-world-2";
import { PeriodFilter } from "./PeriodFilter";
import type { Scene } from "@/lib/scene";

// Auto-drop the live filter after a while: it is a second GPU session and it
// is easy to leave one running behind a tab.
const FILTER_IDLE_MS = 5 * 60_000;

export function WorldStage({ scene }: { scene: Scene | null }) {
  const { status } = useLingbotWorld2();
  const worldTrack = useLingbotWorld2Track("main_video");
  const [filterOn, setFilterOn] = useState(true);
  const [filterError, setFilterError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!filterOn) return;
    timer.current = setTimeout(() => setFilterOn(false), FILTER_IDLE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [filterOn]);

  // A new run publishes a new track; the old filter session is tied to the old
  // one, so start a fresh one rather than feeding SANA a dead track.
  useEffect(() => {
    setFilterOn(!!worldTrack);
    setFilterError(null);
  }, [worldTrack]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-white/[0.08] bg-black">
        <LingbotWorld2MainVideoView
          className="h-full w-full"
          videoObjectFit="contain"
        />
        {filterOn && worldTrack && scene && (
          <PeriodFilter
            key={worldTrack.id}
            track={worldTrack}
            prompt={scene.liveEditPrompt}
            onError={(message) => {
              setFilterError(message);
              setFilterOn(false);
            }}
          />
        )}
        {!worldTrack && (
          <div className="absolute inset-0 flex items-center justify-center text-center font-mono text-[11px] uppercase tracking-wider text-zinc-600">
            {status === "ready"
              ? "Pick a place and a decade, then hit Explore"
              : "Connecting to the world model…"}
          </div>
        )}
        {scene && (
          <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-black/60 px-2.5 py-1.5 backdrop-blur">
            <div className="text-xs text-zinc-100">{scene.place.address}</div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
              {scene.eraLabel}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
          <input
            type="checkbox"
            checked={filterOn}
            disabled={!worldTrack || !scene}
            onChange={(e) => {
              setFilterError(null);
              setFilterOn(e.target.checked);
            }}
            className="size-3.5 accent-primary"
          />
          Live period look
          <span className="text-zinc-600">
            (second GPU session · auto-off after 5 min)
          </span>
        </label>
        {filterError && (
          <span className="text-xs text-red-300">{filterError}</span>
        )}
      </div>
    </div>
  );
}
