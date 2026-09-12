"use client";

// JWT resolvers for the Reactor providers.
//
// `@reactor-team/js-sdk` 3.x takes a `JwtSource` — a static string or a
// resolver. Pass the resolver so the SDK can mint a fresh JWT on every Reactor
// API hop (uploads, clip manifests, ICE refreshes, SDP renegotiation); with a
// static string those hops 401 the moment the token ages out.
//
// A token is memoized here, in module scope, until shortly before it expires,
// and the fetch is `no-store` so the browser HTTP cache is out of the picture.
// This matters because a token is session-scoped: a session can only be
// operated by the exact token that created it, so every hop of a session must
// present the same JWT. Relying on the browser cache for that breaks the moment
// it misses — the resolver then mints a token with no bound sessions and every
// upload/clip call 403s.
//
// Tokens are also model-scoped, so each model gets its own memo slot. This app
// drives two: the world model and the live period filter.

export type ReactorModelKey = "lingbot-world-2" | "sana-streaming";

const TOKEN_REFRESH_SKEW_MS = 60_000;

interface Memo {
  cached: { jwt: string; expiresAtMs: number } | null;
  inflight: Promise<string> | null;
}

const memos: Record<ReactorModelKey, Memo> = {
  "lingbot-world-2": { cached: null, inflight: null },
  "sana-streaming": { cached: null, inflight: null },
};

async function fetchToken(model: ReactorModelKey): Promise<string> {
  const memo = memos[model];
  if (
    memo.cached &&
    Date.now() < memo.cached.expiresAtMs - TOKEN_REFRESH_SKEW_MS
  ) {
    return memo.cached.jwt;
  }
  // Coalesce the parallel hops the SDK fires at connect time into one mint.
  if (memo.inflight) return memo.inflight;
  memo.inflight = (async () => {
    try {
      const r = await fetch(`/api/reactor/token?model=${model}`, {
        cache: "no-store",
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Token fetch failed: ${r.status}`);
      }
      const { jwt, expires_at } = (await r.json()) as {
        jwt: string;
        expires_at: number;
      };
      memo.cached = { jwt, expiresAtMs: expires_at * 1000 };
      return jwt;
    } finally {
      memo.inflight = null;
    }
  })();
  return memo.inflight;
}

// Stable module-level identities: passing these straight to a provider causes
// no re-render churn.
export const lingbotToken = () => fetchToken("lingbot-world-2");
export const sanaToken = () => fetchToken("sana-streaming");

export const REACTOR_API_URL =
  process.env.NEXT_PUBLIC_REACTOR_API_URL ?? "https://api.reactor.inc";
