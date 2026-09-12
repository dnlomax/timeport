// Dead reckoning for the walk. LingBot reports no position — it only takes
// movement *states* — so the app integrates the commands it sent to guess how
// far and which way the camera has travelled since the last real panorama.
//
// The speeds below are estimates of the model's own walking pace, not anything
// it reports, so the guess drifts. That is tolerable: the distance only decides
// *when* to fetch the next panorama, and the heading only decides which way to
// look for it — the panorama itself then puts the walk back on real geometry.

const WALK_SPEED_MPS = 1.5;
const TURN_DEG_PER_SEC = 30;

class Walk {
  private forward = 0;
  private turn = 0;
  private at = 0;
  private travelled = 0;
  private bearing = 0;

  /** Start a fresh leg from a known panorama heading. */
  reset(heading: number) {
    this.flush();
    this.bearing = (heading + 360) % 360;
    this.travelled = 0;
  }

  setLongitudinal(value: string) {
    this.flush();
    this.forward = value === "forward" ? 1 : value === "back" ? -1 : 0;
  }

  setLookHorizontal(value: string) {
    this.flush();
    this.turn = value === "right" ? 1 : value === "left" ? -1 : 0;
  }

  stop() {
    this.flush();
    this.forward = 0;
    this.turn = 0;
  }

  /** Metres walked and degrees faced since the last `reset`. */
  sample(): { heading: number; metres: number } {
    this.flush();
    return { heading: this.bearing, metres: this.travelled };
  }

  // Integrated on read rather than on a timer: the motion is piecewise
  // constant, so the elapsed time between changes is all it takes.
  private flush() {
    const now =
      typeof performance === "undefined" ? Date.now() : performance.now();
    const seconds = (now - this.at) / 1000;
    this.at = now;
    if (!(seconds > 0) || seconds > 60) return;
    // Backing up walks the distance down, never below the anchor itself.
    this.travelled = Math.max(
      0,
      this.travelled + this.forward * WALK_SPEED_MPS * seconds,
    );
    this.bearing =
      (this.bearing + this.turn * TURN_DEG_PER_SEC * seconds + 360) % 360;
  }
}

export const walk = new Walk();
