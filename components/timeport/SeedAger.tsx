"use client";

import { useEffect, useRef, useState } from "react";
import {
  SanaStreamingProvider,
  useSanaStreaming,
  useSanaStreamingChunkComplete,
  useSanaStreamingCommandError,
  useSanaStreamingTrack,
} from "@reactor-models/sana-streaming";
import { REACTOR_API_URL, sanaToken } from "@/lib/reactor-token";

// Ages the seed frame instead of the live stream: the still is published as
// SANA's camera input, the era prompt runs for a few chunks, and one output
// frame is grabbed and handed back as the world model's seed.
//
// The look then comes from LingBot itself rather than from a filter sitting on
// its output, which costs nothing per frame and cannot drift — at the price of
// whatever period detail LingBot invents as you walk away from the seed.
//
// The provider stays mounted and only the run inside it comes and goes: a
// provider that mounts on demand disposes its Reactor on React's double-mount
// and the run then connects against a dead client. Nothing below it may use a
// LingBot hook — the nearest provider wins.

const SANA_WIDTH = 1280;
const SANA_HEIGHT = 704;
const SANA_FPS = 16;

// The first chunks still look like the source; the edit converges over a few.
const SETTLE_CHUNKS = 4;
const DEADLINE_MS = 60_000;

export function SeedAger({
  active,
  ...props
}: {
  active: boolean;
  src: string;
  prompt: string;
  onFrame: (dataUrl: string) => void;
  onError: (message: string) => void;
}) {
  return (
    <SanaStreamingProvider apiUrl={REACTOR_API_URL} jwtToken={sanaToken}>
      {active && <AgeRun {...props} />}
    </SanaStreamingProvider>
  );
}

function AgeRun({
  src,
  prompt,
  onFrame,
  onError,
}: {
  src: string;
  prompt: string;
  onFrame: (dataUrl: string) => void;
  onError: (message: string) => void;
}) {
  const {
    connect,
    disconnect,
    publish,
    unpublish,
    sendCommand,
    setPrompt,
    start,
    reset,
  } = useSanaStreaming();
  const output = useSanaStreamingTrack("main_video");
  const [chunks, setChunks] = useState(0);

  const latest = useRef({
    connect,
    disconnect,
    publish,
    unpublish,
    sendCommand,
    setPrompt,
    start,
    reset,
    output,
    onFrame,
    onError,
  });
  latest.current = {
    connect,
    disconnect,
    publish,
    unpublish,
    sendCommand,
    setPrompt,
    start,
    reset,
    output,
    onFrame,
    onError,
  };

  const chain = useRef<Promise<void>>(Promise.resolve());
  const done = useRef(false);

  useSanaStreamingChunkComplete((message) => {
    setChunks(message.chunk_index + 1);
  });
  useSanaStreamingCommandError((message) => {
    if (done.current) return;
    done.current = true;
    onError(`${message.command}: ${message.reason}`);
  });

  // Same single-chain lifecycle as the live filter: connect/disconnect are not
  // idempotent and StrictMode mounts twice.
  useEffect(() => {
    let live = true;
    const deadline = setTimeout(() => {
      if (done.current) return;
      done.current = true;
      latest.current.onError("The seed frame took too long to develop");
    }, DEADLINE_MS);

    const still = stillTrack(src);

    chain.current = chain.current.then(async () => {
      const sdk = latest.current;
      if (!live) return;
      try {
        const track = await still;
        if (!live) return;
        await sdk.connect();
        if (!live) return;
        track.contentHint = "detail";
        await sdk.publish("camera", track);
        await sdk.sendCommand("set_mode", { mode: "live" });
        await sdk.setPrompt({ prompt });
        await sdk.start();
      } catch (err) {
        if (!live || done.current) return;
        done.current = true;
        sdk.onError(
          err instanceof Error ? err.message : "Could not age the seed frame",
        );
      }
    });

    return () => {
      live = false;
      clearTimeout(deadline);
      chain.current = chain.current.then(async () => {
        const sdk = latest.current;
        try {
          await sdk.reset();
          await sdk.unpublish("camera");
        } catch {
          // the session may already be gone; the disconnect is what frees it
        }
        await sdk.disconnect().catch(() => {});
        await still.then((t) => t.stop()).catch(() => {});
      });
    };
  }, [src, prompt]);

  useEffect(() => {
    if (done.current || chunks < SETTLE_CHUNKS || !output) return;
    done.current = true;
    void grabFrame(output).then(
      (dataUrl) => latest.current.onFrame(dataUrl),
      () => latest.current.onError("Could not read the aged frame"),
    );
  }, [chunks, output]);

  return null;
}

// A still published as video: the model needs a live track, so the same frame
// is redrawn at the rate SANA reads.
async function stillTrack(src: string): Promise<MediaStreamTrack> {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.src = src;
  await image.decode();

  const canvas = document.createElement("canvas");
  canvas.width = SANA_WIDTH;
  canvas.height = SANA_HEIGHT;
  const ctx = canvas.getContext("2d", { alpha: false });
  const stream = canvas.captureStream(SANA_FPS);

  const scale = Math.max(
    SANA_WIDTH / image.naturalWidth,
    SANA_HEIGHT / image.naturalHeight,
  );
  const w = image.naturalWidth * scale;
  const h = image.naturalHeight * scale;

  const track = stream.getVideoTracks()[0];
  const draw = () => {
    if (track.readyState === "ended") return;
    ctx?.drawImage(image, (SANA_WIDTH - w) / 2, (SANA_HEIGHT - h) / 2, w, h);
    requestAnimationFrame(draw);
  };
  draw();

  return track;
}

async function grabFrame(track: MediaStreamTrack): Promise<string> {
  const video = document.createElement("video");
  video.srcObject = new MediaStream([track]);
  video.muted = true;
  video.playsInline = true;
  await video.play();
  // The first painted frame is what the element already holds; wait one more
  // so the grab cannot land on an empty surface.
  await new Promise((resolve) => requestAnimationFrame(resolve));

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || SANA_WIDTH;
  canvas.height = video.videoHeight || SANA_HEIGHT;
  canvas.getContext("2d")?.drawImage(video, 0, 0);
  video.srcObject = null;

  return canvas.toDataURL("image/png");
}
