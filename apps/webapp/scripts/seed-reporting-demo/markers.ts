/**
 * Seed-run markers
 *
 * Constants used to identify rows inserted by the reporting-demo seeder, so
 * the companion cleanup command can drop everything the seeder wrote without
 * touching pre-existing data in the target workspace.
 *
 * - Every `ActivityEvent` the seeder inserts carries `meta.seedRun = SEED_RUN_ID`.
 * - Every other seeded row (Asset, Booking, TeamMember, Category, Location,
 *   CustomField, AuditSession) gets `NAME_SUFFIX` appended to its display
 *   name. This used to be the fallback for rows that couldn't carry the
 *   marker tag; with tags removed from the product it is the only marker.
 *
 * If the seeder is ever re-shaped, bump `SEED_RUN_ID` (e.g. `v2`). Both the
 * seed and clean commands filter on the current id; v1 rows remain inspectable
 * in place until a v1 clean is run.
 */

/** Marker value written to `ActivityEvent.meta.seedRun` on every seeded event. */
export const SEED_RUN_ID = "reporting-demo-v1" as const;

/** Suffix appended to the `name`/`title` of every seeded row. */
export const NAME_SUFFIX = " [seed]" as const;

/**
 * Combined meta object to merge into every seeded event's `meta` payload,
 * alongside any action-specific meta (e.g. `{ isExpected: true }`).
 */
export const SEED_META = { seedRun: SEED_RUN_ID } as const;
