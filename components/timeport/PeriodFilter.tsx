"use client";

import { useEffect, useRef, useState } from "react";
import {
  SanaStreamingMainVideoView,
  useSanaStreaming,
  useSanaStreamingCommandError,
  useSanaStreamingMessage,
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
// SANA renders at a fixed 1280×704 and stops producing frames when fed
// LingBot's native 1664×960, so the track is rescaled through a canvas before
// it is published. A new LingBot run means a new track, and a new track means a
// fresh SANA session (see the `key` in WorldStage).

const SANA_WIDTH = 1280;
const SANA_HEIGHT = 704;
const SANA_FPS = 16;

// Centre-crop rather than letterbox: bars would be part of the frame the model
// restyles.
function useRescaledTrack(source: MediaStreamTrack): MediaStreamTrack | null {
  const [scaled, setScaled] = useState<MediaStreamTrack | null>(null);

  useEffect(() => {
    const video = document.createElement("video");
    video.srcObject = new MediaStream([source]);
    video.muted = true;
    video.playsInline = true;

    const canvas = document.createElement("canvas");
    canvas.width = SANA_WIDTH;
    canvas.height = SANA_HEIGHT;
    const ctx = canvas.getContext("2d", { alpha: false });
    const stream = canvas.captureStream(SANA_FPS);

    let frame = 0;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      if (!ctx || !video.videoWidth) return;
      const scale = Math.max(
        SANA_WIDTH / video.videoWidth,
        SANA_HEIGHT / video.videoHeight,
      );
      const w = video.videoWidth * scale;
      const h = video.videoHeight * scale;
      ctx.drawImage(video, (SANA_WIDTH - w) / 2, (SANA_HEIGHT - h) / 2, w, h);
    };

    // play() rejects with AbortError if the element is torn down first; the
    // draw loop tolerates a video with no frames yet either way.
    void video.play().catch(() => {});
    draw();
    setScaled(stream.getVideoTracks()[0] ?? null);

    return () => {
      cancelAnimationFrame(frame);
      setScaled(null);
      for (const t of stream.getTracks()) t.stop();
      video.srcObject = null;
    };
  }, [source]);

  return scaled;
}

export function PeriodFilter({
  track,
  prompt,
  onError,
}: {
  track: MediaStreamTrack;
  prompt: string;
  onError: (message: string) => void;
}) {
  const scaled = useRescaledTrack(track);

  if (!scaled) return <Developing />;

  return (
    <FilterSession
      key={scaled.id}
      track={scaled}
      prompt={prompt}
      onError={onError}
    />
  );
}

function Developing() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/70 font-mono text-[11px] uppercase tracking-wider text-zinc-400">
      Developing film…
    </div>
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
  const {
    connect,
    disconnect,
    publish,
    unpublish,
    sendCommand,
    setAnchorInterval,
    setPrompt,
    start,
    reset,
  } = useSanaStreaming();
  const [running, setRunning] = useState(false);

  useSanaStreamingMessage((message) => {
    if (process.env.NODE_ENV !== "production") console.debug("[sana]", message);
  });
  useSanaStreamingCommandError((message) => {
    onError(`${message.command}: ${message.reason}`);
  });

  const chain = useRef<Promise<void>>(Promise.resolve());
  const sent = useRef<string | null>(null);
  const latest = useRef({
    connect,
    disconnect,
    publish,
    unpublish,
    sendCommand,
    setAnchorInterval,
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
    sendCommand,
    setAnchorInterval,
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
        // The session defaults to file mode, which ignores the published
        // track. `set_mode` is not in the typed surface of the SDK yet.
        await sdk.sendCommand("set_mode", { mode: "live" });
        // Anchoring is off by default and the edit drifts off the source over
        // a walk — ghosting, smeared facades. Re-ground often.
        await sdk.setAnchorInterval({ chunks: 8 });
        // Start first, prompt after: with no prompt the model streams a
        // near-reconstruction of the source, so frames begin arriving without
        // waiting on the prompt, and the era edit lands a chunk later.
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

  // Prompt edits apply at the next chunk boundary; no restart needed. Keyed on
  // the prompt text, not the setter, whose identity churns with every store
  // update — resending it every render starves generation.
  useEffect(() => {
    if (!running || sent.current === prompt) return;
    sent.current = prompt;
    void latest.current.setPrompt({ prompt }).catch(() => {});
  }, [prompt, running]);

  if (!running) return <Developing />;

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
