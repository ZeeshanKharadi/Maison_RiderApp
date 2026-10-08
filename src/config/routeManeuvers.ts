/**
 * Named defaults for Stage-3 on-screen turn instructions.
 */

/** Advance past a maneuver only after progress exceeds it by this much (meters). */
export const MANEUVER_PASS_TOLERANCE_M = 25;

/** Retreat to a prior instruction when backtracking before this past the previous maneuver. */
export const MANEUVER_BACKTRACK_TOLERANCE_M = 25;

/** Max cross-track when projecting onto overview geometry (meters). */
export const MANEUVER_ALIGN_MAX_CROSS_TRACK_M = 80;

/** Allow tiny non-monotonic projection noise when ordering maneuvers (meters). */
export const MANEUVER_ALIGN_MAX_BACKWARD_M = 15;

/** Departure must land within this distance of route start (meters). */
export const MANEUVER_ALIGN_START_MAX_M = 50;

/** Final arrival must land within this distance of route end (meters). */
export const MANEUVER_ALIGN_END_MAX_M = 80;

/**
 * Tight window around the walked cursor when snapping a maneuver location
 * onto overview geometry (meters). Not a global nearest-point search.
 */
export const MANEUVER_ALIGN_PLACE_WINDOW_M = 100;

/** Search behind the continuity cursor while walking step vertices (meters). */
export const MANEUVER_ALIGN_SEARCH_BACK_M = 40;
