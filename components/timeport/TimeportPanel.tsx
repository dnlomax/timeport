"use client";

import { useState } from "react";
import { useLingbotWorld2 } from "@reactor-models/lingbot-world-2";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ERAS, DEFAULT_ERA_ID, eraById } from "@/lib/eras";
import { SeedAger } from "./SeedAger";
import { dataUrlToBlob, panoImageSrc, type PanoLookup, type Scene } from "@/lib/scene";

type Phase =
  | "idle"
  | "locating"
  | "located"
  | "restyling"
  | "ageing"
  | "ready"
  | "live";

interface Props {
  scene: Scene | null;
  onScene: (scene: Scene | null) => void;
  onLive: (live: boolean) => void;
  restyleAvailable: boolean;
}

// The setup half of the app: pick a place and a decade, then hand a frame to
// the world model. The period look comes from the era prompt plus the live
// SANA filter; the still restyle is an optional extra pass.
export function TimeportPanel({
  scene,
  onScene,
  onLive,
  restyleAvailable,
}: Props) {
  const { status, uploadFile, setImage, setPrompt, start, reset } =
    useLingbotWorld2();

  const [query, setQuery] = useState("");
  const [eraId, setEraId] = useState(DEFAULT_ERA_ID);
  const [place, setPlace] = useState<PanoLookup | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  const busy =
    phase === "locating" || phase === "restyling" || phase === "ageing";

  async function locate() {
    setError(null);
    setPhase("locating");
    onLive(false);
    onScene(null);
    setPlace(null);
    try {
      const res = await fetch("/api/locate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Lookup failed");
      const found = body as PanoLookup;
      setPlace(found);
      onScene(sceneFor(found, eraId));
      setPhase("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed");
      setPhase("idle");
    }
  }

  async function restyle() {
    if (!place) return;
    setError(null);
    setPhase("restyling");
    try {
      const res = await fetch("/api/eraify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          panoId: place.panoId,
          heading: place.heading,
          era: eraId,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Restyle failed");
      onScene({
        eraId,
        eraLabel: eraById(eraId).label,
        place,
        beforeUrl: panoImageSrc(place),
        afterUrl: body.image as string,
        worldPrompt: body.worldPrompt as string,
        liveEditPrompt: body.liveEditPrompt as string,
      });
      setPhase("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restyle failed");
      setPhase("located");
    }
  }

  // The other way to get the era in: age the seed frame through SANA once, so
  // LingBot generates the period world itself and no filter rides its output.
  function ageSeed() {
    if (!scene) return;
    setError(null);
    setPhase("ageing");
  }

  // setImage → setPrompt → start. Each await already waits for the model's
  // own confirmation, so there is nothing to sleep on between the steps.
  async function explore() {
    if (!scene) return;
    setError(null);
    onLive(false);
    try {
      if (phase === "live") await reset();
      const blob = await dataUrlToBlob(scene.afterUrl);
      const ref = await uploadFile(
        new File([blob], "seed.png", { type: blob.type }),
      );
      const accepted = await setImage({ image: ref });
      if (!accepted) throw new Error("The model refused the seed image");
      await setPrompt({ prompt: scene.worldPrompt });
      await start();
      setPhase("live");
      onLive(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the world");
      setPhase("ready");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">
          Where
        </label>
        <div className="mt-1.5 flex gap-2">
          <Input
            value={query}
            placeholder="Lisbon, Portugal"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && query.trim() && !busy) void locate();
            }}
          />
          <Button
            onClick={() => void locate()}
            disabled={!query.trim() || busy}
            className="shrink-0"
          >
            {phase === "locating" ? "Finding…" : "Find"}
          </Button>
        </div>
      </div>

      <div>
        <label className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">
          When
        </label>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          {ERAS.map((era) => (
            <button
              key={era.id}
              type="button"
              onClick={() => {
                setEraId(era.id);
                if (place) onScene(sceneFor(place, era.id));
              }}
              className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                era.id === eraId
                  ? "border-primary/60 bg-primary/10"
                  : "border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05]"
              }`}
            >
              <div className="text-sm text-zinc-100">{era.label}</div>
              <div className="text-[11px] leading-tight text-zinc-500">
                {era.blurb}
              </div>
            </button>
          ))}
        </div>
      </div>

      {place && (
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
          <div className="text-sm text-zinc-200">{place.address}</div>
          <div className="mt-0.5 font-mono text-[11px] text-zinc-500">
            pano {place.panoId.slice(0, 12)}… · heading{" "}
            {place.heading.toFixed(0)}°{place.captured ? ` · ${place.captured}` : ""}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Frame label="Today" src={panoImageSrc(place)} />
            {scene ? (
              <Frame
              label={`Seed · ${scene.eraLabel}${scene.aged ? " aged" : ""}`}
              src={scene.afterUrl}
            />
            ) : (
              <div className="flex aspect-video items-center justify-center rounded-md border border-dashed border-white/[0.12] text-[11px] text-zinc-600">
                {phase === "restyling" || phase === "ageing"
                ? "Developing…"
                : "No seed frame"}
              </div>
            )}
          </div>

          {scene && (
            <SeedAger
              active={phase === "ageing"}
              src={panoImageSrc(place)}
              prompt={scene.liveEditPrompt}
              onFrame={(image) => {
                onScene({ ...scene, afterUrl: image, aged: true });
                setPhase("ready");
              }}
              onError={(message) => {
                setError(message);
                setPhase("ready");
              }}
            />
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={ageSeed}
              disabled={busy}
              className="flex-1"
              title="Run the era prompt over the seed frame once, so the world starts in period instead of being filtered"
            >
              {phase === "ageing"
                ? "Developing…"
                : `Age the seed frame`}
            </Button>
            {restyleAvailable && (
              <Button
                variant="secondary"
                onClick={() => void restyle()}
                disabled={busy}
                className="flex-1"
                title="Optional: age the seed frame with the still-image model instead"
              >
                {phase === "restyling" ? "Time travelling…" : `Age (stills)`}
              </Button>
            )}
            <Button
              onClick={() => void explore()}
              disabled={!scene || status !== "ready" || busy}
              className="flex-1"
            >
              {phase === "live" ? "Restart world" : `Explore the ${eraById(eraId).label}`}
            </Button>
          </div>

          {status !== "ready" && scene && (
            <p className="mt-2 text-[11px] text-zinc-500">
              Connect to the world model first.
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      )}

      <p className="text-[11px] leading-relaxed text-zinc-600">
        Imagery © Google. Street View frames are fetched per request and never
        stored. The period look is generated live, not a photograph of the past.
      </p>
    </div>
  );
}

// Today's frame seeds the world; the era prompt and the live filter carry the
// period look, so no image-generation provider is on the critical path.
function sceneFor(place: PanoLookup, eraId: string): Scene {
  const era = eraById(eraId);
  const src = panoImageSrc(place);
  return {
    eraId,
    eraLabel: era.label,
    place,
    beforeUrl: src,
    afterUrl: src,
    worldPrompt: era.world,
    liveEditPrompt: era.liveEdit,
  };
}

function Frame({ label, src }: { label: string; src: string }) {
  return (
    <figure className="overflow-hidden rounded-md border border-white/[0.08]">
      <div className="aspect-video bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element -- proxied bytes and data URLs, both unoptimizable */}
        <img src={src} alt={label} className="h-full w-full object-cover" />
      </div>
      <figcaption className="bg-white/[0.03] px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
        {label}
      </figcaption>
    </figure>
  );
}
