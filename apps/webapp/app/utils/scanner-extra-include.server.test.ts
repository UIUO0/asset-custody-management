// @vitest-environment node
/**
 * Tests for the scanner extra-include sanitizer (V-003 hardening).
 *
 * Asserts the security-relevant behavior: legitimate scanner-drawer shapes
 * pass through unchanged, while disallowed keys and injectable shapes
 * (`include`, deep nesting, arrays) are stripped.
 *
 * @see {@link file://./scanner-extra-include.server.ts}
 */
import { sanitizeAssetExtraInclude } from "./scanner-extra-include.server";

describe("sanitizeAssetExtraInclude", () => {
  it("keeps the exact shapes the scanner drawers send", () => {
    expect(
      sanitizeAssetExtraInclude({
        location: { select: { id: true, name: true } },
      }),
    ).toEqual({ location: { select: { id: true, name: true } } });

    expect(sanitizeAssetExtraInclude({ category: true })).toEqual({
      category: true,
    });
  });

  it("drops disallowed top-level relations (overfetch / PII traversal)", () => {
    expect(
      sanitizeAssetExtraInclude({
        organization: true,
        bookings: { include: { custodianUser: true } },
        notes: true,
        location: { select: { id: true } },
      }),
    ).toEqual({ location: { select: { id: true } } });
  });

  it("rejects injectable value shapes (include / deep nesting)", () => {
    // allowed key, but `include` (relation traversal) is not an allowed shape
    expect(
      sanitizeAssetExtraInclude({
        location: { include: { assets: { include: { bookings: true } } } },
      }),
    ).toBeUndefined();
  });

  it("rejects nested-select relation traversal under an allowlisted key", () => {
    // Regression: a `{ select: { <relation>: { select|include: ... } } }`
    // payload under an allowlisted key was previously accepted as-is, letting
    // an attacker traverse relations (e.g. location.assets.bookings) despite
    // the top-level allowlist. The fix enforces a *flat* select (boolean
    // values only), so any nested object/array inside select is rejected.
    expect(
      sanitizeAssetExtraInclude({
        location: { select: { assets: { select: { bookings: true } } } },
      }),
    ).toBeUndefined();
    expect(
      sanitizeAssetExtraInclude({
        location: { select: { assets: { include: { bookings: true } } } },
      }),
    ).toBeUndefined();
    // Mixed: one valid boolean + one nested → reject the whole value
    expect(
      sanitizeAssetExtraInclude({
        location: { select: { id: true, assets: { select: { id: true } } } },
      }),
    ).toBeUndefined();
  });

  it("returns undefined for non-objects, arrays and empty results", () => {
    expect(sanitizeAssetExtraInclude(undefined)).toBeUndefined();
    expect(sanitizeAssetExtraInclude("location")).toBeUndefined();
    expect(sanitizeAssetExtraInclude([{ location: true }])).toBeUndefined();
    expect(sanitizeAssetExtraInclude({ organization: true })).toBeUndefined();
  });

  it("drops the removed `kit` key like any other disallowed relation", () => {
    // why: `kit` used to be allowlisted. After the kit model was removed the
    // key must fall through to the default-deny branch, not silently pass.
    expect(
      sanitizeAssetExtraInclude({ kit: { select: { id: true } } }),
    ).toBeUndefined();
  });
});
