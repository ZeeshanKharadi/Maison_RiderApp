/**
 * Named defaults for Stage-2 live route progress and controlled auto-reroute.
 * Tunable without changing algorithm structure.
 */

/** Progress / approximate remaining: urban fused GPS often 40–70 m. */
export const MAX_GPS_ACCURACY_PROGRESS_M = 80;

/** Off-route samples for auto-reroute require tighter accuracy (meters). */
export const MAX_GPS_ACCURACY_REROUTE_M = 35;

/** @deprecated Prefer MAX_GPS_ACCURACY_PROGRESS_M */
export const MAX_GPS_ACCURACY_M = MAX_GPS_ACCURACY_PROGRESS_M;

/** Ignore GPS fixes older than this by GPS timestamp (ms). */
export const MAX_GPS_AGE_MS = 15_000;

/**
 * After resume/refocus: reject measurements whose GPS timestamp is older than
 * this, even if the callback was just received (cached coordinates).
 */
export const RESUME_MAX_GPS_AGE_MS = 5_000;

/** Reject jumps implying speed above this (m/s) ≈ 162 km/h. */
export const MAX_PLAUSIBLE_SPEED_MPS = 45;

/** Reject near-instant jumps larger than this when dt is tiny (meters). */
export const MAX_IMPLAUSIBLE_JUMP_M = 80;

/** Cross-track distance considered off-route (meters). */
export const OFF_ROUTE_DISTANCE_M = 60;

/** Minimum consecutive reliable off-route fixes before auto-reroute. */
export const DEVIATION_MIN_FIXES = 3;

/** Those fixes must span at least this duration (ms). */
export const DEVIATION_MIN_SPAN_MS = 8_000;

/** Minimum gap between automatic reroute attempts (ms). */
export const REROUTE_COOLDOWN_MS = 30_000;

/** Search window ahead of last progress when projecting (meters). */
export const PROGRESS_SEARCH_FORWARD_M = 400;

/** Search window behind last progress when projecting (meters). */
export const PROGRESS_SEARCH_BACK_M = 120;

/** Hold progress for absolute changes smaller than this (meters). */
export const PROGRESS_JITTER_M = 12;

/** Accept backward travel along the route when at least this far (meters). */
export const PROGRESS_MIN_BACKTRACK_ACCEPT_M = 25;
