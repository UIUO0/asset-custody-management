// @vitest-environment node
import type { LoaderFunctionArgs } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "~/database/db.server";
import { loader } from "~/routes/api+/user.entity-counts";
import { requirePermission } from "~/utils/roles.server";

// why: the loader gates on requirePermission; stub it so the test exercises the
// counting logic without a real role/permission lookup.
vi.mock("~/utils/roles.server", () => ({
  requirePermission: vi.fn(),
}));

// why: the loader issues one `count` per entity across the Prisma client; stub
// each so we can assert the shape of the queries and control the totals without
// a database.
vi.mock("~/database/db.server", () => ({
  db: {
    asset: { count: vi.fn() },
    category: { count: vi.fn() },
    tag: { count: vi.fn() },
    location: { count: vi.fn() },
    customField: { count: vi.fn() },
    kit: { count: vi.fn() },
    assetReminder: { count: vi.fn() },
    image: { count: vi.fn() },
  },
}));

const requirePermissionMock = vi.mocked(requirePermission);
const dbMock = db as unknown as Record<
  string,
  { count: ReturnType<typeof vi.fn> }
>;

const ORG = "org-1";
const TARGET = "user-target";

describe("user.entity-counts loader", () => {
  const context = {
    getSession: () => ({ userId: "admin-1" }),
  } as unknown as LoaderFunctionArgs["context"];

  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue({
      organizationId: ORG,
    } as unknown as Awaited<ReturnType<typeof requirePermission>>);
    for (const model of Object.values(dbMock)) {
      model.count.mockResolvedValue(0);
    }
  });

  function run() {
    return loader({
      context,
      request: new Request(
        `http://localhost/api/user/entity-counts?userId=${TARGET}`,
      ),
      params: {},
    } as LoaderFunctionArgs);
  }

  it("sums every counted entity into the total", async () => {
    // The total is what the change-role dialog asks the admin to consent to,
    // so it must not drift from the individual counts beside it.
    dbMock.asset.count.mockResolvedValue(2);
    dbMock.image.count.mockResolvedValue(3);

    const result = (await run()) as unknown as {
      data: { assets: number; images: number; total: number };
    };

    expect(result.data.assets).toBe(2);
    expect(result.data.images).toBe(3);
    // Every other count is stubbed to 0.
    expect(result.data.total).toBe(5);
  });
});
