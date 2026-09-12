"use client";

import { useState } from "react";
import { LingbotWorld2Provider, useLingbotWorld2 } from "@reactor-models/lingbot-world-2";
import { Header } from "@/components/Header";
import { SnapClip } from "@/components/SnapClip";
import { Button } from "@/components/ui/button";
import { DriveControls } from "@/components/timeport/DriveControls";
import { TimeportPanel } from "@/components/timeport/TimeportPanel";
import { WorldStage } from "@/components/timeport/WorldStage";
import { REACTOR_API_URL, lingbotToken } from "@/lib/reactor-token";
import type { Scene } from "@/lib/scene";

// Street View frame → period restyle → walkable world.
//
// Two Reactor sessions can be live at once: LingBot World 2 generates the
// world, and (optionally) SANA-Streaming re-renders LingBot's output track in
// the period look. The two providers share one React context, so the SANA
// provider wraps nothing but the filter overlay (see WorldStage) — anything
// else under it would resolve its LingBot hooks to the SANA session.
export function TimeportApp({ restyleAvailable }: { restyleAvailable: boolean }) {
  const [scene, setScene] = useState<Scene | null>(null);
  const [live, setLive] = useState(false);
  const [reseeding, setReseeding] = useState(false);

  return (
    <div className="flex h-dvh flex-col bg-zinc-950 text-zinc-100">
      <Header />
      <LingbotWorld2Provider apiUrl={REACTOR_API_URL} jwtToken={lingbotToken}>
        <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 lg:flex-row lg:p-6">
          <aside className="flex w-full shrink-0 flex-col gap-4 overflow-y-auto lg:w-[22rem]">
            <ConnectionBar />
            <TimeportPanel
              scene={scene}
              onScene={setScene}
              onLive={setLive}
              onReseeding={setReseeding}
              restyleAvailable={restyleAvailable}
            />
            <SnapClip filename="timeport.mp4" label="Snap 10s" />
          </aside>
          <main className="flex min-h-0 flex-1 flex-col gap-3">
            <WorldStage scene={scene} live={live} reseeding={reseeding} />
            <Stage scene={scene} />
          </main>
        </div>
      </LingbotWorld2Provider>
    </div>
  );
}

function Stage({ scene }: { scene: Scene | null }) {
  const { status } = useLingbotWorld2();
  return <DriveControls enabled={status === "ready" && !!scene} />;
}

function ConnectionBar() {
  const { status, connect, disconnect } = useLingbotWorld2();
  const connected = status === "ready";
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2">
      <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-400">
        <span
          className={`mr-2 inline-block size-1.5 rounded-full ${
            connected
              ? "bg-emerald-400"
              : status === "disconnected"
                ? "bg-zinc-600"
                : "bg-amber-400"
          }`}
        />
        {status}
      </span>
      <Button
        size="xs"
        variant={connected ? "secondary" : "default"}
        onClick={() => void (connected ? disconnect() : connect())}
        disabled={status === "connecting"}
      >
        {connected ? "Disconnect" : "Connect"}
      </Button>
    </div>
  );
}
