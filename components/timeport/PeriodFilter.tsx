"use client";

import { useEffect, useRef, useState } from "react";
import {
  SanaStreamingProvider,
  SanaStreamingMainVideoView,
  useSanaStreaming,
} from "@reactor-models/sana-streaming";
import { REACTOR_API_URL, sanaToken } from "@/lib/reactor-token";

// Second Reactor session, chained onto the first: LingBot's output track is
// published straight back out as SANA's `camera` input, and SANA re-renders it
// every frame in the period look. The seed frame already set the era, this
// keeps it from drifting modern as the world generates new geometry.
//
// SANA is resolution-sensitive — a size change mid-chunk kills the session — so
// the track is taken as-is from LingBot, which emits one fixed size for the
// lifetime of a run. A new LingBot run means a new track, and a new track means
// a fresh SANA session (see the `key` in WorldStage).

export function PeriodFilter({
  track,
  prompt,
  onError,
}: {
  track: MediaStreamTrack;
  prompt: string;
  onError: (message: string) => void;
}) {
  return (
    <SanaStreamingProvider apiUrl={REACTOR_API_URL} jwtToken={sanaToken}>
      <FilterSession track={track} prompt={prompt} onError={onError} />
    </SanaStreamingProvider>
  );
}

function FilterSession({
  track,
  prompt,
  onError,
}: {
  track: MediaStreamTrack;
  prompt: string;
  onError: (message: string) => void;
}) {
  const { status, publish, unpublish, setPrompt, start, reset } =
    useSanaStreaming();
  const [running, setRunning] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (status !== "ready" || startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        track.contentHint = "detail";
        await publish("camera", track);
        if (cancelled) return;
        await setPrompt({ prompt });
        await start();
        if (!cancelled) setRunning(true);
      } catch (err) {
        onError(
          err instanceof Error ? err.message : "Period filter failed to start",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, track, prompt, publish, setPrompt, start, onError]);

  // Prompt edits apply at the next chunk boundary; no restart needed.
  useEffect(() => {
    if (!running) return;
    void setPrompt({ prompt }).catch(() => {});
  }, [prompt, running, setPrompt]);

  useEffect(() => {
    return () => {
      void reset().catch(() => {});
      void unpublish("camera").catch(() => {});
    };
  }, [reset, unpublish]);

  if (!running) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black/70 font-mono text-[11px] uppercase tracking-wider text-zinc-400">
        Developing film…
      </div>
    );
  }

  return (
    <SanaStreamingMainVideoView
      className="absolute inset-0 h-full w-full"
      videoObjectFit="contain"
    />
  );
}
