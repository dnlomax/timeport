import { NextResponse } from "next/server";

// The models this app drives. A minted JWT is scoped to exactly one of them:
// the token can create sessions for that model only, and can act only on the
// sessions it created — nothing else on the account. So the browser asks for
// the model it is about to connect to.
const MODELS = {
  "lingbot-world-2": "reactor/lingbot-world-2",
  "sana-streaming": "reactor/sana-streaming",
  "fast-h3": "reactor/fast-h3",
} as const;

type ModelKey = keyof typeof MODELS;

// Session budget for one token — how many sessions it may ever create
// (closed sessions still count). The client reuses one token for its
// whole lifetime, so leave room for a burst of reconnects.
const MAX_SESSIONS = 10;

// How long we ask Reactor to make the JWT valid for (the server caps
// this at 6h). One hour keeps a memoized token — and its remaining
// session budget — from outliving a normal visit.
const TOKEN_LIFETIME_SECONDS = 60 * 60;

// Mint a session-scoped Reactor JWT and return it together with its
// `expires_at`, so the client can memoize it for exactly its lifetime.
export async function GET(request: Request) {
  const requested =
    new URL(request.url).searchParams.get("model") ?? "lingbot-world-2";
  if (!(requested in MODELS)) {
    return NextResponse.json(
      { error: `Unknown model "${requested}"` },
      { status: 400 },
    );
  }
  const modelName = MODELS[requested as ModelKey];

  const apiKey = process.env.REACTOR_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "REACTOR_API_KEY is not set on the server" },
      { status: 500 },
    );
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_REACTOR_API_URL || "https://api.reactor.inc";

  const res = await fetch(`${baseUrl}/tokens`, {
    method: "POST",
    headers: {
      "Reactor-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      expires_after: TOKEN_LIFETIME_SECONDS,
      // This is what downscopes the token. Without it the JWT carries the
      // API key's full user-level access; with it the browser only ever
      // holds a credential for sessions it started itself on this model,
      // so a leaked token is a bounded loss instead of an account key.
      authorization_details: [
        {
          type: "session",
          resources: { models: { match: [modelName] } },
          constraints: { max_sessions: MAX_SESSIONS },
        },
      ],
    }),
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: `Reactor /tokens returned ${res.status}` },
      { status: 502 },
    );
  }

  const { jwt, expires_at } = (await res.json()) as {
    jwt: string;
    expires_at: number;
  };

  // `expires_at` (unix seconds, decided by the server) lets the client
  // memoize the token for exactly its real lifetime. The client fetches
  // with `no-store` and owns the caching itself — a token must stay
  // stable for a session's whole life (the session is bound to the token
  // that created it), and the browser HTTP cache can't be trusted with
  // that (DevTools "Disable cache", eviction).
  return NextResponse.json(
    { jwt, expires_at },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
