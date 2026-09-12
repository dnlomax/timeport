import { TimeportApp } from "./TimeportApp";
import { SetupRequired } from "./SetupRequired";

// The page is a Server Component. Its only job is to check whether
// the app is configured (Reactor + Maps keys are present) and render the
// right tree:
//   - missing key  → friendly <SetupRequired /> landing
//   - present      → <TimeportApp />, which resolves JWTs itself
//
// We don't mint the token here. Token minting lives behind
// /api/reactor/token so the same client-side flow works whether the
// frontend is Next.js, Vite, CRA, or anything else — the route is
// the framework-agnostic contract.
//
// `dynamic = "force-dynamic"` skips static prerendering so the env
// check runs per-request.
export const dynamic = "force-dynamic";

export default function Page() {
  const configured =
    !!process.env.REACTOR_API_KEY && !!process.env.GOOGLE_MAPS_API_KEY;
  const restyleAvailable =
    !!process.env.GEMINI_API_KEY || !!process.env.VERTEX_API_KEY;
  return configured ? (
    <TimeportApp restyleAvailable={restyleAvailable} />
  ) : (
    <SetupRequired />
  );
}
