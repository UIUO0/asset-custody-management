import { describe, expect, it } from "vitest";
import { getAssetOverviewFields } from "./fields";

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
