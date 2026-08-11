import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { locationDescendantsMock } from "@mocks/location-descendants";
import type { Filter } from "~/components/assets/assets-index/advanced-filters/schema";
import { ShelfError } from "~/utils/error";
import {
  assetQueryFragment,
  assetQueryJoins,
  buildAdvancedAssetsQuery,
  generateCustomFieldSelect,
  generateWhereClause,
  parseSortingOptions,
} from "./query.server";

// why: mocking location descendants to avoid database queries during tests
vi.mock("~/modules/location/descendants.server", () => locationDescendantsMock);

const DEFAULT_FALLBACK_ORDER_BY =
  'ORDER BY "assetCreatedAt" DESC, "assetId" ASC';

describe("parseSortingOptions", () => {
  it("allows sorting by updatedAt", () => {
    const { orderByClause } = parseSortingOptions(["updatedAt:desc"]);

    // Explicit sorts carry a stable `"assetId" ASC` tiebreaker for deterministic
    // pagination across rows tied on the sort key.
    expect(orderByClause).toBe('ORDER BY "assetUpdatedAt" desc, "assetId" ASC');
  });

  // The inner clause feeds `ROW_NUMBER() OVER (ORDER BY ...)` in the
  // paginate-first rewrite: it must equal the full clause minus the leading
  // "ORDER BY " token, for both explicit and default sorts.
  it("exposes the inner order-by (no leading ORDER BY) for an explicit sort", () => {
    const { orderByClause, orderByInner } = parseSortingOptions([
      "updatedAt:desc",
    ]);
    expect(orderByInner).toBe('"assetUpdatedAt" desc, "assetId" ASC');
    expect(orderByClause).toBe(`ORDER BY ${orderByInner}`);
  });

  it("does not duplicate the assetId tiebreaker when the sort already uses id", () => {
    // `id` maps to the "assetId" column, so the tiebreaker must not be appended
    // again (otherwise ORDER BY would list "assetId" twice).
    const { orderByInner } = parseSortingOptions(["id:asc"]);
    expect(orderByInner).toBe('"assetId" asc');
    expect(orderByInner.match(/"assetId"/g)).toHaveLength(1);

    // Also deduped when id is a secondary sort term.
    const combo = parseSortingOptions(["name:asc", "id:desc"]).orderByInner;
    expect(combo.match(/"assetId"/g)).toHaveLength(1);
  });

  it("exposes the inner order-by for the default (no-sort) fallback", () => {
    const { orderByInner } = parseSortingOptions([]);
    expect(orderByInner).toBe('"assetCreatedAt" DESC, "assetId" ASC');
  });

  describe("direction validation", () => {
    it("normalizes uppercase DESC to desc", () => {
      const { orderByClause } = parseSortingOptions(["updatedAt:DESC"]);
      // Explicit sorts get a stable `"assetId" ASC` tiebreaker so paging is
      // deterministic across rows tied on the sort key.
      expect(orderByClause).toBe(
        'ORDER BY "assetUpdatedAt" desc, "assetId" ASC',
      );
    });

    it("normalizes mixed-case Desc to desc", () => {
      const { orderByClause } = parseSortingOptions(["updatedAt:Desc"]);
      expect(orderByClause).toBe(
        'ORDER BY "assetUpdatedAt" desc, "assetId" ASC',
      );
    });

    // Regression test for GHSA-69xv-wmgg-3qp3: SQL injection via direction.
    // Invalid directions must throw a 400 — the malicious SQL never reaches
    // the database and the user gets an explicit error instead of silently
    // sorting ascending.
    it("rejects SQL injection payloads in the direction", () => {
      expect(() =>
        parseSortingOptions(["updatedAt:asc; DROP TABLE Asset; --"]),
      ).toThrow(ShelfError);
    });

    // Regression test using the exact PoC shape from the GHSA-69xv-wmgg-3qp3
    // report. The split(":") only takes the first colon, so the entire
    // "asc,(SELECT ...)" string lands in `direction` and must be rejected.
    it("rejects the reporter's exact PoC subquery payload", () => {
      expect(() =>
        parseSortingOptions([
          "createdAt:asc,(SELECT CASE WHEN 1=2 THEN 1 ELSE 1/0 END)",
        ]),
      ).toThrow(ShelfError);
    });

    it("throws on an unrecognized direction string", () => {
      expect(() => parseSortingOptions(["updatedAt:foobar"])).toThrow(
        ShelfError,
      );
    });

    it("throws with HTTP 400 status on invalid direction", () => {
      try {
        parseSortingOptions(["updatedAt:nope"]);
        throw new Error("expected parseSortingOptions to throw");
      } catch (err) {
        expect(err).toBeInstanceOf(ShelfError);
        expect((err as ShelfError).status).toBe(400);
      }
    });

    it("defaults missing direction to asc", () => {
      const { orderByClause } = parseSortingOptions(["updatedAt"]);
      expect(orderByClause).toBe(
        'ORDER BY "assetUpdatedAt" asc, "assetId" ASC',
      );
    });

    it("defaults empty direction to asc", () => {
      const { orderByClause } = parseSortingOptions(["updatedAt:"]);
      expect(orderByClause).toBe(
        'ORDER BY "assetUpdatedAt" asc, "assetId" ASC',
      );
    });
  });

  describe("barcode field validation", () => {
    it("permits a known-good barcode column", () => {
      const { orderByClause } = parseSortingOptions(["barcode_Code128:asc"]);
      expect(orderByClause).toContain("barcode_Code128");
      expect(orderByClause).toContain("asc");
    });

    it("drops a barcode field whose suffix contains injection chars", () => {
      const { orderByClause } = parseSortingOptions([
        'barcode_Code128";DROP--:asc',
      ]);
      expect(orderByClause).toBe(DEFAULT_FALLBACK_ORDER_BY);
      expect(orderByClause).not.toContain("DROP");
    });

    it("drops a barcode field with empty suffix", () => {
      const { orderByClause } = parseSortingOptions(["barcode_:asc"]);
      expect(orderByClause).toBe(DEFAULT_FALLBACK_ORDER_BY);
    });

    it("drops a barcode field with whitespace in the suffix", () => {
      const { orderByClause } = parseSortingOptions(["barcode_Code 128:asc"]);
      expect(orderByClause).toBe(DEFAULT_FALLBACK_ORDER_BY);
    });
  });

  describe("custom field (cf_*) validation", () => {
    it("permits a simple custom field name", () => {
      const { orderByClause, customFieldSortings } = parseSortingOptions([
        "cf_Manufacturer:asc:TEXT",
      ]);
      expect(customFieldSortings).toHaveLength(1);
      expect(customFieldSortings[0].alias).toBe("cf_Manufacturer");
      expect(orderByClause).toContain("cf_Manufacturer");
    });

    it("normalizes whitespace in custom field name to underscores", () => {
      const { customFieldSortings } = parseSortingOptions([
        "cf_legit name:asc:TEXT",
      ]);
      expect(customFieldSortings).toHaveLength(1);
      expect(customFieldSortings[0].alias).toBe("cf_legit_name");
    });

    it("drops a custom field name containing injection chars", () => {
      const { orderByClause, customFieldSortings } = parseSortingOptions([
        "cf_x;DROP TABLE:asc:TEXT",
      ]);
      expect(customFieldSortings).toHaveLength(0);
      expect(orderByClause).toBe(DEFAULT_FALLBACK_ORDER_BY);
      expect(orderByClause).not.toContain("DROP");
    });

    it("drops a custom field name containing parentheses", () => {
      const { orderByClause, customFieldSortings } = parseSortingOptions([
        "cf_Cost (USD):asc:AMOUNT",
      ]);
      expect(customFieldSortings).toHaveLength(0);
      expect(orderByClause).toBe(DEFAULT_FALLBACK_ORDER_BY);
    });

    it("uses direct sort for DATE fields", () => {
      const { orderByClause } = parseSortingOptions(["cf_x:asc:DATE"]);
      expect(orderByClause).toBe('ORDER BY cf_x asc, "assetId" ASC');
    });

    it("uses ::numeric cast for AMOUNT fields", () => {
      const { orderByClause } = parseSortingOptions(["cf_x:asc:AMOUNT"]);
      expect(orderByClause).toBe('ORDER BY cf_x::numeric asc, "assetId" ASC');
    });

    it("falls through to natural sort for unknown fieldType", () => {
      const { orderByClause } = parseSortingOptions(["cf_x:asc:bogusType"]);
      expect(orderByClause).toContain("LOWER(regexp_replace(cf_x");
    });
  });

  describe("mixed and edge cases", () => {
    it("emits valid terms while skipping invalid ones in the same array", () => {
      const { orderByClause, customFieldSortings } = parseSortingOptions([
        "updatedAt:desc",
        "cf_x;DROP:asc:TEXT",
        "name:asc",
      ]);
      expect(customFieldSortings).toHaveLength(0);
      expect(orderByClause).toContain('"assetUpdatedAt" desc');
      expect(orderByClause).toContain('"assetTitle"');
      expect(orderByClause).not.toContain("DROP");
    });

    it("falls back to default sort when every term is invalid", () => {
      const { orderByClause } = parseSortingOptions([
        "evil:asc",
        "alsoEvil:desc",
      ]);
      expect(orderByClause).toBe(DEFAULT_FALLBACK_ORDER_BY);
    });

    it("falls back to default sort for an empty input array", () => {
      const { orderByClause } = parseSortingOptions([]);
      expect(orderByClause).toBe(DEFAULT_FALLBACK_ORDER_BY);
    });

    it("uses sequential-id sort expression for sequentialId", () => {
      const { orderByClause } = parseSortingOptions(["sequentialId:asc"]);
      expect(orderByClause).toContain('"assetSequentialId"');
      expect(orderByClause).toContain("LPAD(SPLIT_PART");
    });

    it("uses custody jsonb path for custody", () => {
      const { orderByClause } = parseSortingOptions(["custody:desc"]);
      // Regression (custody-sort no-op): the `custody` column is a jsonb
      // ARRAY (`Custody[]`) since the quantity-tracked multi-custodian
      // refactor, not a single object. `custody->>'name'` on an array
      // returns NULL for every row (asc == desc, only the id tiebreaker
      // orders), so we must index the first element: `custody->0->>'name'`.
      expect(orderByClause).toContain("custody->0->>'name'");
      // Guard against a regression back to the object-shaped key that
      // silently no-ops on the array.
      expect(orderByClause).not.toContain("custody->>'name'");
      expect(orderByClause).toContain("desc");
    });

    // Regression test: `in` walks the prototype chain, so without
    // Object.hasOwn() field names like "toString" or "constructor" would
    // resolve to inherited methods and produce broken SQL. Must fall through
    // to the unknown-field branch instead.
    it("does not match inherited Object.prototype keys via 'in'", () => {
      const inheritedKeys = [
        "toString",
        "constructor",
        "hasOwnProperty",
        "valueOf",
      ];
      for (const key of inheritedKeys) {
        const { orderByClause } = parseSortingOptions([`${key}:asc`]);
        expect(orderByClause).toBe(DEFAULT_FALLBACK_ORDER_BY);
      }
    });
  });
});

describe("generateCustomFieldSelect", () => {
  it("returns Prisma.empty for an empty input", () => {
    const result = generateCustomFieldSelect([]);
    // Prisma.empty has no strings/values to interpolate
    expect(result.strings.join("")).toBe("");
  });

  it("emits a SELECT subquery for a safe alias", () => {
    const result = generateCustomFieldSelect([
      { name: "Manufacturer", valueKey: "raw", alias: "cf_Manufacturer" },
    ]);
    expect(result.strings.join("?")).toContain("AS ");
    expect(result.strings.join("?")).toContain("cf_Manufacturer");
  });

  // Defense-in-depth: even though parseSortingOptions already validates
  // aliases, generateCustomFieldSelect must not trust its input. A future
  // refactor or alternate caller must not be able to inject SQL via cf.alias.
  it("throws ShelfError when an alias contains unsafe characters", () => {
    expect(() =>
      generateCustomFieldSelect([
        { name: "x", valueKey: "raw", alias: "cf_x; DROP--" },
      ]),
    ).toThrow(ShelfError);
  });

  it("throws ShelfError when an alias is empty", () => {
    expect(() =>
      generateCustomFieldSelect([{ name: "x", valueKey: "raw", alias: "" }]),
    ).toThrow(ShelfError);
  });
});

/**
 * Helper to extract SQL string from Prisma.Sql object for testing
 * Joins the strings array to get a readable representation
 */
function getSqlString(sql: ReturnType<typeof generateWhereClause>): string {
  return sql.strings.join("?");
}

describe("generateWhereClause - special filter values", () => {
  const orgId = "test-org-id";

  describe("custody filter with special values", () => {
    /**
     * Custody is direct only. The booking-derived custody path went with the
     * booking system (2026-08-06), so each of these also asserts the SQL does
     * NOT mention `Booking` — the tables are dropped, and a stray join would
     * fail at runtime where TypeScript cannot see it.
     */
    it("handles 'in-custody' with is operator", () => {
      const filter: Filter = {
        name: "custody",
        type: "enum",
        operator: "is",
        value: "in-custody",
      };

      const result = generateWhereClause(orgId, null, [filter]);
      const sql = getSqlString(result);

      expect(sql).toContain("jsonb_array_length(custody_agg.custody) > 0");
      expect(sql).not.toContain("Booking");
    });

    it("handles 'in-custody' with isNot operator", () => {
      const filter: Filter = {
        name: "custody",
        type: "enum",
        operator: "isNot",
        value: "in-custody",
      };

      const result = generateWhereClause(orgId, null, [filter]);
      const sql = getSqlString(result);

      expect(sql).toContain("jsonb_array_length(custody_agg.custody) = 0");
      expect(sql).not.toContain("Booking");
    });

    it("handles 'without-custody' with is operator", () => {
      const filter: Filter = {
        name: "custody",
        type: "enum",
        operator: "is",
        value: "without-custody",
      };

      const result = generateWhereClause(orgId, null, [filter]);
      const sql = getSqlString(result);

      expect(sql).toContain("jsonb_array_length(custody_agg.custody) = 0");
      expect(sql).not.toContain("Booking");
    });

    it("handles containsAny with only 'in-custody'", () => {
      const filter: Filter = {
        name: "custody",
        type: "enum",
        operator: "containsAny",
        value: "in-custody",
      };

      const result = generateWhereClause(orgId, null, [filter]);
      const sql = getSqlString(result);

      expect(sql).toContain("jsonb_array_length(custody_agg.custody) > 0");
      expect(sql).not.toContain("Booking");
    });

    it("handles containsAny with 'in-custody' + specific IDs (subsumes to in-custody)", () => {
      const filter: Filter = {
        name: "custody",
        type: "enum",
        operator: "containsAny",
        value: "in-custody,specific-team-member-id",
      };

      const result = generateWhereClause(orgId, null, [filter]);
      const sql = getSqlString(result);

      // "in-custody" subsumes specific IDs - checks for any custody
      expect(sql).toContain("jsonb_array_length(custody_agg.custody) > 0");
      expect(sql).not.toContain("Booking");
      // Should NOT contain specific ID matching since in-custody covers all
      expect(sql).not.toContain("specific-team-member-id");
    });

    it("handles containsAny with both 'in-custody' and 'without-custody' (matches all)", () => {
      const filter: Filter = {
        name: "custody",
        type: "enum",
        operator: "containsAny",
        value: "in-custody,without-custody",
      };

      const result = generateWhereClause(orgId, null, [filter]);
      const sql = getSqlString(result);

      // Should not add any custody-specific conditions (matches everything)
      expect(sql).not.toContain("jsonb_array_length(custody_agg.custody) = 0");
      expect(sql).not.toContain("jsonb_array_length(custody_agg.custody) > 0");
    });

    it("handles containsAny with 'without-custody' + specific IDs (OR logic)", () => {
      const filter: Filter = {
        name: "custody",
        type: "enum",
        operator: "containsAny",
        value: "without-custody,specific-team-member-id",
      };

      const result = generateWhereClause(orgId, null, [filter]);
      const sql = getSqlString(result);

      // Should include both conditions: no custody OR specific custodian
      expect(sql).toContain("jsonb_array_length(custody_agg.custody) = 0");
      expect(sql).toContain("Custody");
    });
  });

  describe("location filter with special values", () => {
    it("handles 'in-location' with is operator", () => {
      const filter: Filter = {
        name: "location",
        type: "enum",
        operator: "is",
        value: "in-location",
      };

      const result = generateWhereClause(orgId, null, [filter]);
      const sql = getSqlString(result);

      // An asset has a location iff at least one AssetLocation pivot row exists.
      expect(sql).toContain(
        'EXISTS (SELECT 1 FROM public."AssetLocation" al WHERE al."assetId" = a.id)',
      );
    });

    it("handles 'in-location' with isNot operator (inverts to no location)", () => {
      const filter: Filter = {
        name: "location",
        type: "enum",
        operator: "isNot",
        value: "in-location",
      };

      const result = generateWhereClause(orgId, null, [filter]);
      const sql = getSqlString(result);

      expect(sql).toContain(
        'NOT EXISTS (SELECT 1 FROM public."AssetLocation" al WHERE al."assetId" = a.id)',
      );
    });

    it("handles 'without-location' with is operator", () => {
      const filter: Filter = {
        name: "location",
        type: "enum",
        operator: "is",
        value: "without-location",
      };

      const result = generateWhereClause(orgId, null, [filter]);
      const sql = getSqlString(result);

      expect(sql).toContain(
        'NOT EXISTS (SELECT 1 FROM public."AssetLocation" al WHERE al."assetId" = a.id)',
      );
    });

    it("handles containsAny with only 'in-location'", () => {
      const filter: Filter = {
        name: "location",
        type: "enum",
        operator: "containsAny",
        value: "in-location",
      };

      const result = generateWhereClause(orgId, null, [filter]);
      const sql = getSqlString(result);

      expect(sql).toContain(
        'EXISTS (SELECT 1 FROM public."AssetLocation" al WHERE al."assetId" = a.id)',
      );
    });

    it("handles containsAny with both 'in-location' and 'without-location' (matches all)", () => {
      const filter: Filter = {
        name: "location",
        type: "enum",
        operator: "containsAny",
        value: "in-location,without-location",
      };

      const result = generateWhereClause(orgId, null, [filter]);
      const sql = getSqlString(result);

      // Should not add any location-specific conditions
      expect(sql).not.toContain('"AssetLocation"');
    });

    it("handles containsAny with 'without-location' + specific IDs (OR logic)", () => {
      const filter: Filter = {
        name: "location",
        type: "enum",
        operator: "containsAny",
        value: "without-location,specific-location-id",
      };

      const result = generateWhereClause(orgId, null, [filter]);
      const sql = getSqlString(result);

      // Should include both branches: no AssetLocation row OR a row for the
      // specific location id.
      expect(sql).toContain(
        'NOT EXISTS (SELECT 1 FROM public."AssetLocation" al WHERE al."assetId" = a.id)',
      );
      expect(sql).toContain('"AssetLocation"');
      expect(sql).toContain('al."locationId" = ANY');
    });

    // why: regression test for SHELF-WEBAPP-1MY — a `withinHierarchy` location
    // filter pointing at a deleted/stale location expands to a `containsAny`
    // filter with an empty array of descendant ids. The builder must not call
    // `Prisma.join([])` (which throws) and should match no assets instead of
    // crashing the entire /assets index with a 500.
    it("handles containsAny with an empty array (expanded withinHierarchy to no descendants)", () => {
      const filter: Filter = {
        name: "location",
        type: "enum",
        operator: "containsAny",
        value: [],
      };

      expect(() => generateWhereClause(orgId, null, [filter])).not.toThrow();

      const sql = getSqlString(generateWhereClause(orgId, null, [filter]));
      // An empty location set matches no assets.
      expect(sql).toContain("1=0");
    });

    it("handles containsAny with an empty string (no location ids) without throwing", () => {
      const filter: Filter = {
        name: "location",
        type: "enum",
        operator: "containsAny",
        value: "",
      };

      expect(() => generateWhereClause(orgId, null, [filter])).not.toThrow();

      const sql = getSqlString(generateWhereClause(orgId, null, [filter]));
      expect(sql).toContain("1=0");
    });
  });

  // why: regression coverage for SHELF-WEBAPP-1MY and its sibling branches. A
  // `containsAny` filter whose id list resolves to empty (e.g. a stale
  // `withinHierarchy` expansion, or an empty submitted value) must never call
  // `Prisma.join([])` (which throws and 500s the /assets index). Every such
  // branch should instead emit a no-match clause (`1=0`).
  describe("containsAny with an empty id set is non-fatal (matches nothing)", () => {
    const cases: { name: Filter["name"] }[] = [
      { name: "location" },
      { name: "category" },
      { name: "custody" },
    ];

    for (const { name } of cases) {
      it(`handles empty containsAny for "${name}" without throwing`, () => {
        const filter = {
          name,
          type: "enum",
          operator: "containsAny",
          value: [] as string[],
        } as Filter;

        expect(() => generateWhereClause(orgId, null, [filter])).not.toThrow();
        expect(
          getSqlString(generateWhereClause(orgId, null, [filter])),
        ).toContain("1=0");
      });
    }
  });
});

describe("assetQueryFragment", () => {
  /**
   * Helper to extract SQL string from Prisma.Sql for testing.
   * Joins the strings array to get a readable representation.
   */
  function getFragmentSqlString(sql: ReturnType<typeof assetQueryFragment>) {
    return sql.strings.join("?");
  }

  describe("custody output", () => {
    it("projects custody without any booking-derived fallback", () => {
      const fragment = assetQueryFragment();
      const sql = getFragmentSqlString(fragment);

      // why: custody used to fall back to an active booking's custodian for
      // CHECKED_OUT assets. That branch — and the `Booking` lateral feeding
      // it — went with the booking system. A stray reference here would only
      // fail once the query hits Postgres, so guard it in the SQL text.
      expect(sql).not.toContain("Booking");
      expect(sql).not.toContain("b.id IS NOT NULL");
    });

    it("projects direct custody from the lateral aggregation", () => {
      const fragment = assetQueryFragment();
      const sql = getFragmentSqlString(fragment);

      // Custody flows through the per-asset lateral aggregation
      // (custody_agg.custody) rather than a JOIN-based CASE — this prevents
      // per-custody-row duplication for qty-tracked assets with multiple
      // custodians (Issue A). Since the booking fallback was removed the
      // projection is the aggregate itself, with no CASE wrapping it.
      expect(sql).toContain("custody_agg.custody AS custody");
    });

    it("does not gate the direct custody projection on CHECKED_OUT", () => {
      const fragment = assetQueryFragment();
      const sql = getFragmentSqlString(fragment);

      // Regression guard: the direct-custody branch must remain
      // independent of asset status.
      expect(sql).not.toContain(
        "jsonb_array_length(custody_agg.custody) > 0 AND a.status = 'CHECKED_OUT'",
      );
    });
  });

  describe("custody lateral aggregation (Issue A)", () => {
    /**
     * The lateral-subquery pattern (mirroring the barcodes lateral) is
     * what makes a single asset return one row regardless of how many
     * custody rows it has. Without this, the previous direct LEFT JOINs
     * on Custody + TeamMember + User caused the asset to be returned N
     * times for N custodians.
     */
    function getJoinsSqlString(sql: typeof assetQueryJoins) {
      return sql.strings.join("?");
    }

    it("aggregates custody rows via a lateral subquery, not direct JOINs", () => {
      const sql = getJoinsSqlString(assetQueryJoins);

      // The lateral aliased as `custody_agg` must exist
      expect(sql).toContain("LEFT JOIN LATERAL");
      expect(sql).toContain(") custody_agg ON TRUE");

      // jsonb_agg over Custody is what produces the multi-row array
      expect(sql).toContain("jsonb_agg(");
      expect(sql).toContain('FROM public."Custody" cu');
    });

    it("does not LEFT JOIN Custody at the outer level", () => {
      const sql = getJoinsSqlString(assetQueryJoins);

      // The outer-level direct join on Custody (`LEFT JOIN public."Custody"
      // cu ON cu."assetId" = a.id`) was the root cause of duplication.
      // It must now live exclusively inside the lateral subquery — the
      // outer query may no longer reference cu without a `FROM` clause.
      expect(sql).not.toMatch(
        /LEFT JOIN public\."Custody" cu ON cu\."assetId" = a\.id/,
      );
    });

    it("keeps TeamMember/User joins scoped inside the custody lateral", () => {
      const sql = getJoinsSqlString(assetQueryJoins);

      // The outer query must NOT carry direct outer joins on `tm` / `u`
      // that hang off `cu` — those belong in the lateral.
      // Strip the lateral block then assert.
      const outerOnly = sql.replace(
        /LEFT JOIN LATERAL \([\s\S]*?\) custody_agg ON TRUE/,
        "",
      );
      expect(outerOnly).not.toMatch(
        /LEFT JOIN public\."TeamMember" tm ON cu\."teamMemberId" = tm\.id/,
      );
      expect(outerOnly).not.toMatch(
        /LEFT JOIN public\."User" u ON tm\."userId" = u\.id/,
      );
    });

    it("includes per-custody quantity in the aggregated jsonb objects", () => {
      const sql = getJoinsSqlString(assetQueryJoins);

      // qty-tracked assets need the per-custody-row quantity exposed so
      // the UI can render `name (quantity)` for each custodian.
      expect(sql).toContain("'quantity', cu.quantity");
    });

    it("orders the custody aggregation deterministically for a stable primary", () => {
      const sql = getJoinsSqlString(assetQueryJoins);

      // The custody sort key (`custody->0->>'name'`) and the rendered badge
      // (formatCustodyList picks custody[0]) both rely on element 0 being
      // the primary custodian. jsonb_agg has an undefined input order without
      // an explicit ORDER BY, so a multi-custodian (qty-tracked) asset's
      // primary — and thus its sort key — could otherwise vary by plan and
      // disagree with the badge. Oldest-first (createdAt, id) matches the
      // kit/location primary-pick convention.
      expect(sql).toContain('ORDER BY cu."createdAt" ASC, cu.id ASC');
    });

    it("falls back to '[]'::jsonb when an asset has no custody rows", () => {
      const sql = getJoinsSqlString(assetQueryJoins);

      // COALESCE ensures custody_agg.custody is always an array, never
      // null — keeps the CASE branch in assetQueryFragment simple.
      expect(sql).toContain("COALESCE(");
      expect(sql).toContain("'[]'::jsonb");
    });
  });

  describe("withCustomFieldDefinitions option", () => {
    it("includes full definitions by default (matches AdvancedIndexAsset type)", () => {
      const fragment = assetQueryFragment();
      const sql = getFragmentSqlString(fragment);

      // Default should include all definition columns
      expect(sql).toContain("helpText");
      expect(sql).toContain("cf.required");
      expect(sql).toContain("cf.options");
      expect(sql).toContain("categories");
      expect(sql).toContain("_CategoryToCustomField");
      expect(sql).toContain("Category");
    });

    it("excludes full definitions when withCustomFieldDefinitions is false", () => {
      const fragment = assetQueryFragment({
        withCustomFieldDefinitions: false,
      });
      const sql = getFragmentSqlString(fragment);

      // Should include basic custom field columns
      expect(sql).toContain("customField");
      expect(sql).toContain("cf.id");
      expect(sql).toContain("cf.name");
      expect(sql).toContain("cf.type");

      // Should NOT include definition-only columns
      expect(sql).not.toContain("helpText");
      expect(sql).not.toContain("cf.required");
      expect(sql).not.toContain("cf.options");
      expect(sql).not.toContain("categories");
      expect(sql).not.toContain("_CategoryToCustomField");
    });
  });

  describe("quantity-tracking fields projection (import-ready export)", () => {
    it("projects minQuantity and consumptionType by their mapped column names", () => {
      // why: Prisma.sql is an opaque string to TS, so a wrong/missing column
      // name only surfaces as a runtime 500. Guard the projection statically.
      const fragment = assetQueryFragment();
      const sql = getFragmentSqlString(fragment);

      expect(sql).toContain('a."minQuantity" AS "assetMinQuantity"');
      expect(sql).toContain('a."consumptionType" AS "assetConsumptionType"');
    });
  });
});

describe("generateWhereClause - barcode value case normalization", () => {
  const orgId = "test-org-id";

  /**
   * ExternalQR barcodes are stored with their original case (see
   * `normalizeBarcodeValue`), so an exact-match filter must NOT uppercase the
   * supplied value — otherwise `b.value = ...` never matches a lowercase code.
   * Regression test for the `is` operator dropping ExternalQR matches.
   */
  it("preserves original case for ExternalQR with the 'is' operator", () => {
    const filter: Filter = {
      name: "barcode_ExternalQR",
      type: "string",
      operator: "is",
      value: "813e1ae5",
    };

    const result = generateWhereClause(orgId, null, [filter]);

    // The interpolated value must keep its original case for ExternalQR
    expect(result.values).toContain("813e1ae5");
    expect(result.values).not.toContain("813E1AE5");
  });

  it("preserves original case for ExternalQR with the 'isNot' operator", () => {
    const filter: Filter = {
      name: "barcode_ExternalQR",
      type: "string",
      operator: "isNot",
      value: "813e1ae5",
    };

    const result = generateWhereClause(orgId, null, [filter]);

    expect(result.values).toContain("813e1ae5");
    expect(result.values).not.toContain("813E1AE5");
  });

  it("preserves original case for ExternalQR with the 'matchesAny' operator", () => {
    const filter: Filter = {
      name: "barcode_ExternalQR",
      type: "string",
      operator: "matchesAny",
      value: "813e1ae5,abc9Def0",
    };

    const result = generateWhereClause(orgId, null, [filter]);

    expect(result.values).toContain("813e1ae5");
    expect(result.values).toContain("abc9Def0");
  });

  /**
   * Non-ExternalQR barcode types (Code128, Code39, …) are stored uppercased,
   * so their exact-match filters must continue to uppercase the supplied value.
   */
  it("uppercases the value for Code128 with the 'is' operator", () => {
    const filter: Filter = {
      name: "barcode_Code128",
      type: "string",
      operator: "is",
      value: "abc123",
    };

    const result = generateWhereClause(orgId, null, [filter]);

    expect(result.values).toContain("ABC123");
    expect(result.values).not.toContain("abc123");
  });
});

describe("buildAdvancedAssetsQuery", () => {
  /** Joins the raw SQL segments; interpolated values render as `?`. */
  function getQuerySqlString(sql: Prisma.Sql): string {
    return sql.strings.join("?");
  }

  /**
   * Assembles the query through the real builder + fragments, mirroring the
   * service call site so these assertions lock the shipped shape.
   */
  function build(overrides?: {
    sortBy?: string[];
    parsedFilters?: Filter[];
    withBookings?: boolean;
    withBarcodes?: boolean;
    search?: string | null;
  }): Prisma.Sql {
    const sortBy = overrides?.sortBy ?? [];
    const parsedFilters = overrides?.parsedFilters ?? [];
    const search = overrides?.search ?? null;
    const whereClause = generateWhereClause("org-1", search, parsedFilters);
    const { orderByInner, customFieldSortings } = parseSortingOptions(sortBy);
    return buildAdvancedAssetsQuery({
      whereClause,
      orderByInner,
      customFieldSortings,
      sortBy,
      parsedFilters,
      withBarcodes: overrides?.withBarcodes ?? false,
      paginationClause: Prisma.sql`LIMIT ${100} OFFSET ${0}`,
      hasSearch: Boolean(search),
    });
  }

  it("emits the three-CTE + lateral paginate-first skeleton", () => {
    const sql = getQuerySqlString(build());

    expect(sql).toContain("WITH asset_query AS");
    expect(sql).toContain("sorted_asset_query AS");
    expect(sql).toContain("count_query AS");
    expect(sql).toContain("COUNT(*)::integer AS total_count");
    // Heavy projection runs once per page row via a correlated lateral.
    expect(sql).toContain("LEFT JOIN LATERAL");
    expect(sql).toContain('WHERE a.id = saq."assetId"');
  });

  it("freezes the sort into an integer ROW_NUMBER rank and replays it", () => {
    const sql = getQuerySqlString(build());

    // Default sort feeds the window; the array is ordered by the frozen rank.
    expect(sql).toContain(
      'ROW_NUMBER() OVER (ORDER BY "assetCreatedAt" DESC, "assetId" ASC)',
    );
    expect(sql).toContain('AS "__sortRank"');
    expect(sql).toContain('ORDER BY saq."__sortRank"');
  });

  it("keeps the slim cheap phase to id + light sort keys (no heavy projection)", () => {
    const sql = getQuerySqlString(build());

    // Base sort keys are always selected directly off the scan.
    expect(sql).toContain('a.value AS "assetValue"');
    expect(sql).toContain('a.quantity AS "assetQuantity"');
  });

  it("gates a name-sort column in the cheap phase on the active sort", () => {
    // Isolate the CHEAP phase (everything before `sorted_asset_query`) to
    // assert the gating: default sort omits the name joins/selects there — the
    // residual-O(N) fix — and sorting by one brings it back.
    const cheap = (overrides?: Parameters<typeof build>[0]) => {
      const sql = getQuerySqlString(build(overrides));
      return sql.slice(0, sql.indexOf("sorted_asset_query"));
    };
    const def = cheap({ sortBy: [] });
    expect(def).not.toContain('c.name AS "categoryName"');
    expect(def).not.toContain('l.name AS "locationName"');

    expect(cheap({ sortBy: ["category:asc"] })).toContain(
      'c.name AS "categoryName"',
    );
    expect(cheap({ sortBy: ["location:asc"] })).toContain(
      'l.name AS "locationName"',
    );
  });

  it("keeps Category/Location joins for text search even without a name sort", () => {
    // The search predicate references c.name / l.name in the WHERE, so a search
    // must resolve those joins (independent of any sort). `c.name ILIKE` only
    // appears when a search is active, so it is the reliable signal.
    expect(getQuerySqlString(build({ search: "widget" }))).toContain(
      "c.name ILIKE",
    );
    expect(getQuerySqlString(build({ sortBy: [] }))).not.toContain(
      "c.name ILIKE",
    );
  });

  it("injects the barcode sort-key selects only when a barcode sort is active", () => {
    // withBarcodes:false ⇒ the heavy phase omits barcode scalars, so any
    // `AS barcode_Code128` must come from the cheap phase's sort-key select.
    const withBarcodeSort = getQuerySqlString(
      build({ sortBy: ["barcode_Code128:asc"], withBarcodes: false }),
    );
    expect(withBarcodeSort).toContain("AS barcode_Code128");

    const withoutBarcodeSort = getQuerySqlString(
      build({ sortBy: [], withBarcodes: false }),
    );
    expect(withoutBarcodeSort).not.toContain("AS barcode_Code128");
  });

  it("selects a.value (never valuation) — respects the @map column", () => {
    const sql = getQuerySqlString(build());
    expect(sql).toContain('a.value AS "assetValue"');
    expect(sql).not.toContain("a.valuation");
  });

  it("sorts custody by the first array element with a deterministic primary", () => {
    // `custody` is a jsonb array; the sort key must index element 0
    // (`custody->0->>'name'`), and the cheap-phase custody aggregation must
    // order its jsonb_agg so element 0 is stable and matches the badge.
    const sql = getQuerySqlString(build({ sortBy: ["custody:asc"] }));

    // Array-indexed sort key (never the object-shaped no-op `custody->>'name'`).
    expect(sql).toContain("custody->0->>'name'");
    expect(sql).not.toContain("custody->>'name'");
    // Cheap-phase custody aggregation is injected for the sort and carries the
    // deterministic ordering (mirrors the heavy phase).
    expect(sql).toContain(") custody_agg ON TRUE");
    expect(sql).toContain('ORDER BY cu."createdAt" ASC, cu.id ASC');
  });
});

/**
 * Every SQL alias the query references must also be joined.
 *
 * TypeScript cannot see inside a `Prisma.sql` template, so removing a JOIN and
 * leaving a reference behind compiles, passes every unit test, and then fails
 * only when Postgres parses it — as a 500 on the page, for the roles whose
 * index happens to be in ADVANCED mode.
 *
 * This has now bitten twice, both times from the same removal:
 *
 * - 2026-08-06 — the booking laterals (`b`, `bu`, `btm`) were removed but
 *   stayed in the `GROUP BY`. `/assets` broke for المالية and المخزون.
 * - 2026-08-11 — the same three aliases were still referenced by
 *   `CUSTODY_SORT_CASE`, which is only emitted when a **custody sort** is
 *   active. The 2026-08-06 test built one query with the default sort, so the
 *   broken shape was never generated and the suite stayed green while
 *   `?sortBy=custody:asc` returned a 500.
 *
 * The lesson in the second one is the important one: asserting on a single
 * generated query only covers the branches that query happens to take. These
 * tests therefore sweep EVERY sort shape and both search states.
 */
describe("buildAdvancedAssetsQuery — no orphaned aliases", () => {
  /** Sort keys that each switch on a different set of joins/selects. */
  const SORT_SHAPES = [
    [],
    ["category:asc"],
    ["location:asc"],
    ["assetModel:asc"],
    ["qrId:asc"],
    ["custody:asc"],
    ["barcode_Code128:asc"],
    ["createdAt:desc"],
  ];

  /**
   * SQL comments are part of the template string, so an assertion like
   * `not.toContain("GROUP BY")` would trip on a comment that merely explains
   * why there is no GROUP BY. Strip them before asserting on structure.
   */
  function stripSqlComments(sql: string) {
    return sql.replace(/--[^\n]*/g, "");
  }

  function sqlFor(sortBy: string[], hasSearch = false, withBarcodes = false) {
    const query = buildAdvancedAssetsQuery({
      whereClause: generateWhereClause("org-1", hasSearch ? "pen" : null, []),
      ...parseSortingOptions(sortBy),
      sortBy,
      parsedFilters: [],
      withBarcodes,
      paginationClause: Prisma.sql`LIMIT 20 OFFSET 0`,
      hasSearch,
    } as never);
    return (query as unknown as { strings: string[] }).strings.join("$1");
  }

  /** Every shape the production caller can produce. */
  function allShapes(): Array<{ label: string; sql: string }> {
    const out: Array<{ label: string; sql: string }> = [];
    for (const sortBy of SORT_SHAPES) {
      for (const hasSearch of [false, true]) {
        for (const withBarcodes of [false, true]) {
          out.push({
            label: `sort=${
              sortBy.join(",") || "default"
            } search=${hasSearch} barcodes=${withBarcodes}`,
            sql: stripSqlComments(sqlFor(sortBy, hasSearch, withBarcodes)),
          });
        }
      }
    }
    return out;
  }

  it("never references the removed booking aliases in any shape", () => {
    for (const { label, sql } of allShapes()) {
      // `b.` is legitimate inside the Barcode subqueries, so assert on the
      // booking-only aliases and on the table names themselves.
      expect(sql, label).not.toContain('public."Booking"');
      expect(sql, label).not.toContain('public."BookingAsset"');
      expect(sql, label).not.toMatch(/\bbu\./);
      expect(sql, label).not.toMatch(/\bbtm\./);
    }
  });

  it("never references the removed kit and tag tables in any shape", () => {
    for (const { label, sql } of allShapes()) {
      expect(sql, label).not.toContain('public."Kit"');
      expect(sql, label).not.toContain('public."AssetKit"');
      expect(sql, label).not.toContain('public."Tag"');
      expect(sql, label).not.toContain('public."_AssetToTag"');
    }
  });

  /**
   * Generic backstop: every `<alias>.<column>` reference must have a matching
   * FROM/JOIN. This is what would have caught BOTH incidents above without
   * anyone having to think of the specific alias.
   */
  it("only references aliases the query actually introduces", () => {
    // Aliases bound by something other than a FROM/JOIN we can pattern-match
    // (CTE names, the json_agg row alias, subquery-local aliases).
    const BOUND_ELSEWHERE = new Set([
      // `public."Table"` is a schema qualifier, not an alias.
      "public",
      "aq",
      "saq",
      "asset_query",
      "sorted_asset_query",
      "count_query",
    ]);

    for (const { label, sql } of allShapes()) {
      const introduced = new Set<string>(BOUND_ELSEWHERE);
      for (const m of sql.matchAll(
        /(?:FROM|JOIN)\s+public\."[A-Za-z_]+"\s+([a-z][a-z0-9_]*)/g,
      )) {
        introduced.add(m[1]);
      }
      // LATERAL subqueries: `) alias ON TRUE`
      for (const m of sql.matchAll(/\)\s*([a-z][a-z0-9_]*)\s+ON TRUE/g)) {
        introduced.add(m[1]);
      }
      // CTE definitions: `name AS (`
      for (const m of sql.matchAll(/([a-z][a-z0-9_]*)\s+AS\s*\(/g)) {
        introduced.add(m[1]);
      }

      const referenced = new Set<string>();
      for (const m of sql.matchAll(/\b([a-z][a-z0-9_]*)\."?[A-Za-z_]/g)) {
        referenced.add(m[1]);
      }

      for (const alias of referenced) {
        expect(
          introduced.has(alias),
          `${label}: alias "${alias}" is referenced but never joined`,
        ).toBe(true);
      }
    }
  });

  /**
   * The heavy projection lost its only aggregate when the fanning tag join
   * went away, so it must no longer carry a GROUP BY. A GROUP BY reappearing
   * means a fanning join crept back in.
   */
  it("has no GROUP BY — every remaining join yields one row per asset", () => {
    for (const { label, sql } of allShapes()) {
      expect(sql, label).not.toContain("GROUP BY");
    }
  });
});
