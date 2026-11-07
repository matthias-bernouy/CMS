import { expect, test } from "bun:test";
import type { Collection } from "mongodb";
import { latestOperation } from "../../src/runtime/provider-operations/latestOperation";

test("setup polling performs one indexed scoped metadata read and never projects inputs, results or request context", async () => {
    const reads: unknown[] = [];
    const record = {
        _id: "operation-a",
        siteId: "site-a",
        contractId: "ulvia/cms.installations",
        capabilityId: "initialization.apply",
        status: "running",
        revision: 1,
        createdAt: "2026-11-07T00:00:00Z",
        updatedAt: "2026-11-07T00:00:00Z",
        get input() {
            throw new Error("Input bodies must not be read");
        },
        get result() {
            throw new Error("Result bodies must not be read");
        },
        get context() {
            throw new Error("Request contexts must not be read");
        },
    };
    const collection = {
        findOne: async (filter: unknown, options: unknown) => {
            reads.push({ filter, options });
            return record;
        },
    } as unknown as Parameters<typeof latestOperation>[0];
    const summary = await latestOperation(collection, "site-a", "ulvia/cms.installations", "initialization.apply");
    expect(summary).toMatchObject({ id: "operation-a", status: "running" });
    expect(Object.keys(summary!)).not.toContain("input");
    expect(reads).toEqual([
        {
            filter: { siteId: "site-a", contractId: "ulvia/cms.installations", capabilityId: "initialization.apply" },
            options: {
                sort: { _id: -1 },
                projection: {
                    _id: 1,
                    siteId: 1,
                    contractId: 1,
                    capabilityId: 1,
                    status: 1,
                    revision: 1,
                    createdAt: 1,
                    updatedAt: 1,
                    errorCode: 1,
                    errorOutput: 1,
                    errorContentLanguage: 1,
                },
            },
        },
    ]);
    await expect(
        latestOperation(collection, "site-b", "ulvia/cms.installations", "initialization.apply"),
    ).rejects.toThrow("Invalid persisted operation summary");
});
