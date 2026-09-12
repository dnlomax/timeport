"use client";

import { useEffect, useRef, useState } from "react";
import {
  LingbotWorld2MainVideoView,
  useLingbotWorld2,
  useLingbotWorld2Track,
} from "@reactor-models/lingbot-world-2";
import { SanaStreamingProvider } from "@reactor-models/sana-streaming";
import { PeriodFilter } from "./PeriodFilter";
import { REACTOR_API_URL, sanaToken } from "@/lib/reactor-token";
import { eraById } from "@/lib/eras";
import type { Scene } from "@/lib/scene";

// Auto-drop the live filter after a while: it is a second GPU session and it
// is easy to leave one running behind a tab.
const FILTER_IDLE_MS = 5 * 60_000;

// How long the frozen frame takes to dissolve into the restarted world.
const DISSOLVE_MS = 900;
// Frames to let through before dissolving, so the hold does not lift onto the
// stale last frame of the old run.
const FRESH_FRAMES = 3;

export function WorldStage({
  scene,
  live,
  reseeding,
}: {
  scene: Scene | null;
  live: boolean;
  reseeding: boolean;
}) {
  const { status } = useLingbotWorld2();
  const worldTrack = useLingbotWorld2Track("main_video");
  const trackId = worldTrack?.id ?? null;
  const [filterOn, setFilterOn] = useState(true);
  const [gradeOn, setGradeOn] = useState(true);
  const [filterError, setFilterError] = useState<string | null>(null);
  // An aged seed already puts the era inside the world, so filtering on top
  // would style an already-period image twice.
  const aged = scene?.aged ?? false;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const hold = useRef<HTMLCanvasElement>(null);
  const [dissolve, setDissolve] = useState<"off" | "holding" | "lifting">(
    "off",
  );

  useEffect(() => {
    if (!filterOn) return;
    timer.current = setTimeout(() => setFilterOn(false), FILTER_IDLE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [filterOn]);

  // A new run publishes a new track; the old filter session is tied to the old
  // one, so start a fresh one rather than feeding SANA a dead track. Keyed on
  // the track id, not the object, which is a fresh reference every render.
  useEffect(() => {
    setFilterOn(!aged);
    setFilterError(null);
  }, [trackId, aged]);

  // Re-seeding restarts generation, which black-frames the track for a second
  // or two. Freeze the last frame over it and dissolve back once the new world
  // is actually painting, so a hand-over between panoramas reads as a walk
  // rather than a cut.
  useEffect(() => {
    const video = stage.current?.querySelector("video");
    if (reseeding) {
      const canvas = hold.current;
      if (canvas && video?.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext("2d")?.drawImage(video, 0, 0);
        setDissolve("holding");
      }
      return;
    }
    if (dissolve !== "holding") return;

    let cancelled = false;
    const lift = () => {
      if (cancelled) return;
      setDissolve("lifting");
      setTimeout(() => !cancelled && setDissolve("off"), DISSOLVE_MS);
    };
    let seen = 0;
    const onFrame = () => {
      if (cancelled) return;
      if (++seen >= FRESH_FRAMES) return lift();
      video?.requestVideoFrameCallback(onFrame);
    };
    video?.requestVideoFrameCallback(onFrame);
    // A run that never comes back must not leave the world frozen.
    const bail = setTimeout(lift, 8000);
    return () => {
      cancelled = true;
      clearTimeout(bail);
    };
  }, [reseeding, dissolve]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-white/[0.08] bg-black">
        {/* The grade goes on the world, not on the filter output, which is
            already styled by the model. */}
        <div
          ref={stage}
          className="relative h-full w-full"
          style={
            gradeOn && !filterOn && scene
              ? { filter: eraById(scene.eraId).grade }
              : undefined
          }
        >
          <LingbotWorld2MainVideoView
            className="h-full w-full"
            videoObjectFit="contain"
          />
          <canvas
            ref={hold}
            className={`pointer-events-none absolute inset-0 h-full w-full object-contain transition-opacity ${
              dissolve === "holding" ? "opacity-100" : "opacity-0"
            } ${dissolve === "off" ? "hidden" : ""}`}
            style={{ transitionDuration: `${DISSOLVE_MS}ms` }}
          />
        </div>
        {/* Mounted for the life of the stage: a provider that mounts on demand
            rebuilds and disposes its Reactor. It wraps only the overlay, since
            the nearest provider wins for every Reactor hook below it. */}
        <SanaStreamingProvider apiUrl={REACTOR_API_URL} jwtToken={sanaToken}>
          {live && filterOn && worldTrack && scene && (
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
        </SanaStreamingProvider>
        {!live && (
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
            disabled={!scene}
            onChange={(e) => {
              setFilterError(null);
              setFilterOn(e.target.checked);
            }}
            className="size-3.5 accent-primary"
          />
          Live period look
          <span className="text-zinc-600">
            {aged
              ? "(the seed is already aged · toggle to compare)"
              : "(second GPU session · auto-off after 5 min)"}
          </span>
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
          <input
            type="checkbox"
            checked={gradeOn}
            disabled={!scene || filterOn}
            onChange={(e) => setGradeOn(e.target.checked)}
            className="size-3.5 accent-primary"
          />
          Film grade
          <span className="text-zinc-600">(free · holds the era&apos;s colour)</span>
        </label>
        {filterError && (
          <span className="text-xs text-red-300">{filterError}</span>
        )}
      </div>
    </div>
  );
}
