"use client";

import { useCallback, useEffect, useRef } from "react";
import { useLingbotWorld2 } from "@reactor-models/lingbot-world-2";
import { walk } from "@/lib/walk";

// Movement in LingBot World 2 is a *state*, not a nudge: "forward" keeps
// walking until something sends "idle". Every press therefore needs a matching
// release, including the ones the browser swallows (pointer leaving the button,
// tab losing focus, component unmounting mid-walk).
export function DriveControls({ enabled }: { enabled: boolean }) {
  const {
    setMoveLongitudinal,
    setMoveLateral,
    setLookHorizontal,
    setLookVertical,
  } = useLingbotWorld2();

  const held = useRef(new Set<string>());

  const send = useCallback(
    (key: string, value: string) => {
      const idle = value === "idle";
      if (idle) held.current.delete(key);
      else held.current.add(key);
      // The same commands feed the dead reckoning that decides when to fetch
      // the next real panorama.
      if (key === "long") walk.setLongitudinal(value);
      if (key === "lookH") walk.setLookHorizontal(value);
      switch (key) {
        case "long":
          return void setMoveLongitudinal({
            move_longitudinal: value as "idle" | "forward" | "back",
          });
        case "lat":
          return void setMoveLateral({
            move_lateral: value as "idle" | "strafe_left" | "strafe_right",
          });
        case "lookH":
          return void setLookHorizontal({
            look_horizontal: value as "idle" | "left" | "right",
          });
        case "lookV":
          return void setLookVertical({
            look_vertical: value as "idle" | "up" | "down",
          });
      }
    },
    [setMoveLongitudinal, setMoveLateral, setLookHorizontal, setLookVertical],
  );

  // `send` is rebuilt whenever the SDK hands back new setters, which happens
  // mid-walk. Route the release paths through a ref so a new identity cannot
  // re-run their cleanup and idle a key the user is still holding.
  const sendRef = useRef(send);
  sendRef.current = send;

  const releaseAll = useCallback(() => {
    for (const key of [...held.current]) sendRef.current(key, "idle");
  }, []);

  // Release everything on unmount / disable, otherwise the avatar walks off
  // into the 1920s forever.
  useEffect(() => {
    if (enabled) return;
    releaseAll();
  }, [enabled, releaseAll]);

  useEffect(() => releaseAll, [releaseAll]);

  useEffect(() => {
    if (!enabled) return;
    const keys: Record<string, [string, string]> = {
      w: ["long", "forward"],
      s: ["long", "back"],
      a: ["lat", "strafe_left"],
      d: ["lat", "strafe_right"],
      ArrowLeft: ["lookH", "left"],
      ArrowRight: ["lookH", "right"],
      ArrowUp: ["lookV", "up"],
      ArrowDown: ["lookV", "down"],
    };
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const hit = keys[e.key.length === 1 ? e.key.toLowerCase() : e.key];
      if (!hit) return;
      e.preventDefault();
      send(hit[0], hit[1]);
    };
    const up = (e: KeyboardEvent) => {
      const hit = keys[e.key.length === 1 ? e.key.toLowerCase() : e.key];
      if (!hit) return;
      send(hit[0], "idle");
    };
    const blur = () => releaseAll();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [enabled, send, releaseAll]);

  const pad = (label: string, key: string, value: string) => (
    <button
      key={label}
      type="button"
      disabled={!enabled}
      onPointerDown={() => send(key, value)}
      onPointerUp={() => send(key, "idle")}
      onPointerLeave={() => send(key, "idle")}
      onPointerCancel={() => send(key, "idle")}
      className="h-9 rounded-md border border-white/[0.1] bg-white/[0.03] text-xs text-zinc-200 transition-colors hover:bg-white/[0.08] active:bg-primary/25 disabled:opacity-30"
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div>
        <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
          Walk · wasd
        </div>
        <div className="grid w-[9.5rem] grid-cols-3 gap-1.5">
          <div />
          {pad("↑", "long", "forward")}
          <div />
          {pad("←", "lat", "strafe_left")}
          {pad("↓", "long", "back")}
          {pad("→", "lat", "strafe_right")}
        </div>
      </div>
      <div>
        <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
          Look · arrows
        </div>
        <div className="grid w-[9.5rem] grid-cols-3 gap-1.5">
          <div />
          {pad("↑", "lookV", "up")}
          <div />
          {pad("←", "lookH", "left")}
          {pad("↓", "lookV", "down")}
          {pad("→", "lookH", "right")}
        </div>
      </div>
    </div>
  );
}
