"use client";

import { useEffect, useRef, useState } from "react";
import {
  FastH3MainVideoView,
  FastH3Provider,
  useFastH3,
  useFastH3ClipFailed,
  useFastH3ClipStarted,
  useFastH3CommandError,
} from "@reactor-models/fast-h3";
import { SeedAger } from "./SeedAger";
import { eraById } from "@/lib/eras";
import { REACTOR_API_URL, fastH3Token } from "@/lib/reactor-token";
import {
  dataUrlToBlob,
  gradedStill,
  panoImageSrc,
  type PanoLookup,
  type Scene,
} from "@/lib/scene";

// The other way to walk: keep every real panorama and generate only the metres
// between them.
//
// LingBot takes one seed and invents everything after it. FastH3 builds clips
// that open on one image and *converge onto* another, and chains a clip onto
// the previous clip's last frame with no cut — so a route of real Street View
// panoramas becomes one continuous walk that passes through real geometry at
// every waypoint.
//
// The cost is interactivity: clips are built ahead of playback, so this is a
// street you walk down rather than a world you steer.

const CLIP_SECONDS = 5.167; // the model's shortest clip — the quickest to build
const LOOKAHEAD = 2; // clips kept queued ahead of the one playing
const WALK_NOTE =
  " One continuous forward walk down the street at a steady pace, " +
  "camera at eye height, level and unhurried, no cuts.";

export function RouteWalk({
  scene,
  stops,
  ageStills,
  onError,
}: {
  scene: Scene;
  stops: PanoLookup[];
  ageStills: boolean;
  onError: (message: string) => void;
}) {
  return (
    <FastH3Provider apiUrl={REACTOR_API_URL} jwtToken={fastH3Token}>
      <RouteRun
        scene={scene}
        stops={stops}
        ageStills={ageStills}
        onError={onError}
      />
    </FastH3Provider>
  );
}

function RouteRun({
  scene,
  stops,
  ageStills,
  onError,
}: {
  scene: Scene;
  stops: PanoLookup[];
  ageStills: boolean;
  onError: (message: string) => void;
}) {
  const sdk = useFastH3();
  const [ready, setReady] = useState(false);
  // One entry per stop: the period-treated still the walk passes through.
  const [stills, setStills] = useState<(string | null)[]>(() =>
    stops.map(() => null),
  );
  const [clips, setClips] = useState<string[]>([]);
  const [at, setAt] = useState(0);

  const grade = eraById(scene.eraId).grade;
  const latest = useRef({ sdk, stills, clips, at, stops, scene, onError });
  latest.current = { sdk, stills, clips, at, stops, scene, onError };

  const chain = useRef<Promise<void>>(Promise.resolve());
  const grading = useRef(new Set<number>());
  const pumping = useRef(false);

  // The stills the next few clips will need. Preparing them ahead of the queue
  // keeps a build from waiting on a frame.
  const needUpTo = Math.min(at + LOOKAHEAD + 2, stops.length - 1);

  useFastH3ClipStarted((message) => {
    const index = Number(message.clip.metadata);
    if (Number.isFinite(index)) setAt(index);
  });
  useFastH3ClipFailed((message) => onError(`Clip failed: ${message.reason}`));
  useFastH3CommandError((message) =>
    onError(`${message.command}: ${message.reason}`),
  );

  // Connect once and hold the session for the walk; the queue settings are
  // fixed for its life (the canvas cannot change once clips exist).
  useEffect(() => {
    chain.current = chain.current.then(async () => {
      try {
        await latest.current.sdk.connect();
        await latest.current.sdk.setCanvas({ aspect: "16:9" });
        await latest.current.sdk.setClipSeconds({ seconds: CLIP_SECONDS });
        await latest.current.sdk.setFlushOnClipEnd({ enabled: false });
        await latest.current.sdk.setAutoplay({ enabled: true });
        setReady(true);
      } catch (err) {
        latest.current.onError(
          err instanceof Error ? err.message : "Could not start the route",
        );
      }
    });
    return () => {
      chain.current = chain.current.then(async () => {
        await latest.current.sdk.reset().catch(() => {});
        await latest.current.sdk.disconnect().catch(() => {});
      });
    };
  }, []);

  // Grade the stills that are wanted but not being aged. Ageing is handled by
  // the single SANA run rendered below and lands back here through `stills`.
  useEffect(() => {
    if (ageStills) return;
    for (let i = 0; i <= needUpTo; i++) {
      if (stills[i] != null || grading.current.has(i)) continue;
      grading.current.add(i);
      void gradedStill(panoImageSrc(stops[i]), grade).then(
        (blob) => {
          const url = URL.createObjectURL(blob);
          setStills((all) => all.map((s, j) => (j === i ? url : s)));
        },
        () => onError("Could not read the Street View frame"),
      );
    }
  }, [ageStills, needUpTo, stills, stops, grade, onError]);

  // Queue the clips the walk is about to need, one at a time off the shared
  // chain: a clip is only accepted once both of its real frames exist.
  useEffect(() => {
    if (!ready || pumping.current) return;
    const want = Math.min(at + LOOKAHEAD + 1, stops.length - 1);
    if (clips.length >= want) return;

    const next = clips.length;
    const needed = next === 0 ? [0, 1] : [next + 1];
    if (needed.some((i) => stills[i] == null)) return;

    pumping.current = true;
    chain.current = chain.current.then(async () => {
      try {
        const { sdk } = latest.current;
        const ending = await upload(sdk, latest.current.stills[next + 1]!);
        const opener =
          next === 0
            ? { starting_frame: await upload(sdk, latest.current.stills[0]!) }
            : { continue_from_clip_id: latest.current.clips[next - 1] };
        const queued = await sdk.enqueue({
          prompt: scene.worldPrompt + WALK_NOTE,
          metadata: String(next),
          ending_frame: ending,
          ...opener,
        });
        if (queued) setClips((ids) => [...ids, queued.clip.clip_id]);
      } catch (err) {
        latest.current.onError(
          err instanceof Error ? err.message : "Could not queue the next clip",
        );
      } finally {
        pumping.current = false;
      }
    });
  }, [ready, at, clips, stills, scene.worldPrompt, stops.length]);

  // Ageing runs one still at a time through SANA, ahead of playback, so the
  // waypoints carry period *content* and not just period colour.
  const ageIndex = ageStills
    ? stills.findIndex((s, i) => s == null && i <= needUpTo)
    : -1;

  return (
    <>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-white/[0.08] bg-black">
        <FastH3MainVideoView
          className="h-full w-full"
          videoObjectFit="contain"
          muted
        />
        {!clips.length && (
          <p className="absolute inset-x-0 bottom-3 text-center text-xs text-zinc-400">
            {ready ? "Building the first stretch of street…" : "Connecting…"}
          </p>
        )}
        <p className="absolute left-3 top-3 rounded bg-black/60 px-2 py-1 text-[11px] text-zinc-300">
          Real panorama {Math.min(at + 1, stops.length)} of {stops.length}
          {stops[at]?.captured ? ` · captured ${stops[at].captured}` : ""}
        </p>
      </div>

      {ageIndex >= 0 && (
        <SeedAger
          active
          src={panoImageSrc(stops[ageIndex])}
          prompt={scene.liveEditPrompt}
          onFrame={(dataUrl) =>
            setStills((all) =>
              all.map((s, i) => (i === ageIndex ? dataUrl : s)),
            )
          }
          onError={() =>
            void gradedStill(panoImageSrc(stops[ageIndex]), grade).then(
              (blob) => {
                const url = URL.createObjectURL(blob);
                setStills((all) =>
                  all.map((s, i) => (i === ageIndex ? url : s)),
                );
              },
              () => onError("Could not prepare the next waypoint"),
            )
          }
        />
      )}
    </>
  );
}

async function upload(
  sdk: ReturnType<typeof useFastH3>,
  src: string,
): Promise<Awaited<ReturnType<typeof sdk.uploadFile>>> {
  const blob = await dataUrlToBlob(src);
  return sdk.uploadFile(new File([blob], "waypoint.png", { type: blob.type }));
}
