/**
 * Backwards-compatible re-export.
 *
 * `userHasPermission` used to be implemented here. The `.client` suffix makes
 * React Router's vite plugin stub every export of this module to `undefined` in
 * the server bundle, which crashed any server-rendered component that called it
 * — see the docblock in `permission.validator.ts` for the full story.
 *
 * The implementation now lives in the neutral `permission.validator.ts`. This
 * file stays so the existing import sites keep working; prefer importing from
 * `~/utils/permissions/permission.validator` in new code, and move call sites
 * over opportunistically.
 *
 * @see {@link file://./permission.validator.ts}
 */

export { userHasPermission } from "./permission.validator";
