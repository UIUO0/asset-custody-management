import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  ASSET_DETAIL_SHELL_FIELDS,
  ASSET_EDIT_FORM_FIELDS,
  advancedAssetIndexFields,
  assetIndexFields,
  getAssetOverviewFields,
} from "./fields";

describe("getAssetOverviewFields", () => {
  it("includes full barcodes relation when canUseBarcodes is true", () => {
    const result = getAssetOverviewFields(true);

    expect(result).toHaveProperty("barcodes", {
      select: { id: true, type: true, value: true },
    });
    expect(result).not.toHaveProperty("_count");
  });

  it("includes _count.barcodes (not full barcodes) when canUseBarcodes is false", () => {
    const result = getAssetOverviewFields(false);

    expect(result).toHaveProperty("_count", {
      select: { barcodes: true },
    });
    expect(result).not.toHaveProperty("barcodes");
  });

  it("defaults canUseBarcodes to false when omitted", () => {
    const result = getAssetOverviewFields();

    expect(result).toHaveProperty("_count", {
      select: { barcodes: true },
    });
    expect(result).not.toHaveProperty("barcodes");
  });

  it("always includes base fields (qrCodes, custody, etc.) regardless of flag", () => {
    const baseKeys = [
      "category",
      "qrCodes",
      "assetLocations",
      "custody",
      "organization",
      "customFields",
    ];

    const withBarcodes = getAssetOverviewFields(true);
    const withoutBarcodes = getAssetOverviewFields(false);

    for (const key of baseKeys) {
      expect(withBarcodes).toHaveProperty(key);
      expect(withoutBarcodes).toHaveProperty(key);
    }
  });
});

/**
 * Every relation an asset `include` names must exist on the `Asset` model.
 *
 * ⚠️ This is the ONLY automated check for that. TypeScript will not do it:
 * `getAsset<T extends Prisma.AssetInclude>` accepts an object literal naming a
 * relation `Asset` does not have, because `T` is inferred from the literal and
 * the excess-property check is skipped (a direct `db.asset.findFirst` call DOES
 * error — it is the generic wrapper that goes blind). Prisma only rejects the
 * unknown relation at RUNTIME.
 *
 * That gap shipped `assetKits: { … }` in three live loaders after the Kit model
 * was dropped — past typecheck, lint, 2500 tests and a production build. Every
 * asset page 500'd, and the message said "Asset not found", which reads like a
 * missing row or a permission problem and points nowhere near the cause.
 *
 * This test walks Prisma's own DMMF, so it needs no maintenance when the schema
 * changes. **Any new asset `include` must be exported from `fields.ts` and
 * added to `FIELD_SETS` below** — an include left inline in a loader is
 * invisible here and gets no protection.
 */
describe("asset include shapes match the Prisma schema", () => {
  const ASSET_RELATIONS = new Set(
    Prisma.dmmf.datamodel.models
      .find((model) => model.name === "Asset")!
      .fields.filter((field) => field.kind === "object")
      .map((field) => field.name),
  );

  /** Prisma include keys that are not relations. */
  const NON_RELATION_KEYS = new Set(["_count"]);

  const FIELD_SETS: Array<[string, object]> = [
    ["ASSET_DETAIL_SHELL_FIELDS", ASSET_DETAIL_SHELL_FIELDS],
    ["ASSET_EDIT_FORM_FIELDS", ASSET_EDIT_FORM_FIELDS],
    ["getAssetOverviewFields(true)", getAssetOverviewFields(true)],
    ["getAssetOverviewFields(false)", getAssetOverviewFields(false)],
    ["assetIndexFields()", assetIndexFields()],
    ["advancedAssetIndexFields()", advancedAssetIndexFields()],
  ];

  it.each(FIELD_SETS)(
    "%s names only real Asset relations",
    (_label, fields) => {
      for (const key of Object.keys(fields)) {
        if (NON_RELATION_KEYS.has(key)) continue;
        expect(
          ASSET_RELATIONS.has(key),
          `"${key}" is not a relation on Asset — Prisma would reject this include at runtime`,
        ).toBe(true);
      }
    },
  );

  it("proves the check has teeth (a dropped relation fails)", () => {
    // why: an assertion that can never fail is worse than none. `assetKits` is
    // the exact key that shipped broken, so pin the negative case too.
    expect(ASSET_RELATIONS.has("assetKits")).toBe(false);
    expect(ASSET_RELATIONS.has("tags")).toBe(false);
  });
});
