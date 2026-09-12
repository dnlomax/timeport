"use client";

import { useEffect, useRef, useState } from "react";
import {
  SanaStreamingMainVideoView,
  useSanaStreaming,
} from "@reactor-models/sana-streaming";

// Second Reactor session, chained onto the first: LingBot's output track is
// published straight back out as SANA's `camera` input, and SANA re-renders it
// every frame in the period look.
//
// The provider stays mounted for the life of the stage (see WorldStage) and
// never connects on its own — the session opens here, so an unmounted filter
// costs no GPU time. Setup and teardown run on a single promise chain: they
// are not idempotent (a second connect() while connected is a state error) and
// a remount must queue behind the previous teardown.
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
  const { connect, disconnect, publish, unpublish, setPrompt, start, reset } =
    useSanaStreaming();
  const [running, setRunning] = useState(false);

  const chain = useRef<Promise<void>>(Promise.resolve());
  const latest = useRef({
    connect,
    disconnect,
    publish,
    unpublish,
    setPrompt,
    start,
    reset,
    track,
    prompt,
    onError,
  });
  latest.current = {
    connect,
    disconnect,
    publish,
    unpublish,
    setPrompt,
    start,
    reset,
    track,
    prompt,
    onError,
  };

  useEffect(() => {
    let live = true;

    chain.current = chain.current.then(async () => {
      const sdk = latest.current;
      if (!live) return;
      try {
        await sdk.connect();
        if (!live) return;
        sdk.track.contentHint = "detail";
        await sdk.publish("camera", sdk.track);
        if (!live) return;
        await sdk.setPrompt({ prompt: sdk.prompt });
        await sdk.start();
        if (!live) return;
        setRunning(true);
      } catch (err) {
        if (!live) return;
        sdk.onError(
          err instanceof Error ? err.message : "Period filter failed to start",
        );
      }
    });

    return () => {
      live = false;
      setRunning(false);
      chain.current = chain.current.then(async () => {
        const sdk = latest.current;
        try {
          await sdk.reset();
          await sdk.unpublish("camera");
        } catch {
          // the session may already be gone; the disconnect is what frees it
        }
        await sdk.disconnect().catch(() => {});
      });
    };
  }, []);

  // Prompt edits apply at the next chunk boundary; no restart needed.
  useEffect(() => {
    if (!running) return;
    void setPrompt({ prompt }).catch(() => {});
  }, [prompt, running, setPrompt]);

  if (!running) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black/70 font-mono text-[11px] uppercase tracking-wider text-zinc-400">
        Developing film…
      </div>
    );
  }

  // The view renders its own positioned wrapper around the <video>, so the
  // overlay positioning has to go on a container around it.
  return (
    <div className="absolute inset-0 bg-black">
      <SanaStreamingMainVideoView
        className="h-full w-full"
        videoObjectFit="contain"
      />
    </div>
  );
}
