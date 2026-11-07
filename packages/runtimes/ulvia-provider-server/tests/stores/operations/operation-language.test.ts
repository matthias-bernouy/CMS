import { expect, test } from "bun:test";
import type { Db } from "mongodb";
import type { ProviderOperationRecord } from "@bernouy/ulvia-provider";
import { MongoProviderOperationStore } from "../../../src/runtime/provider-operations/MongoProviderOperationStore";

/** Minimal document port exercising the durable adapter's state and lease fences. */
function database() {
    let document: Record<string, unknown> | undefined;
    const value = (path: string): unknown => {
        let current: unknown = document;
        for (const key of path.split(".")) {
            if (!current || typeof current !== "object") {
                return undefined;
            }
            current = (current as Record<string, unknown>)[key];
        }
        return current;
    };
    const matches = (filter: Record<string, unknown>) =>
        Object.entries(filter).every(([key, expected]) => key === "$or" || value(key) === expected);
    const collection = {
        insertOne: async (record: Record<string, unknown>) => {
            document = structuredClone(record);
        },
        findOne: async (filter: Record<string, unknown>) => (matches(filter) ? structuredClone(document) : null),
        updateOne: async (filter: Record<string, unknown>, change: Record<string, Record<string, unknown>>) => {
            if (!document || !matches(filter)) {
                return { modifiedCount: 0 };
            }
            Object.assign(document, structuredClone(change.$set));
            for (const key of Object.keys(change.$unset ?? {})) {
                delete document[key];
            }
            for (const [key, amount] of Object.entries(change.$inc ?? {})) {
                document[key] = Number(document[key]) + Number(amount);
            }
            return { modifiedCount: 1 };
        },
    };
    return { collection: () => collection } as unknown as Db;
}

test("Mongo operations persist actual error language and deny foreign reads or stale leases", async () => {
    const store = new MongoProviderOperationStore(database());
    const record: ProviderOperationRecord = {
        id: "operation-a",
        siteId: "site-a",
        contractId: "ulvia/cms.installations",
        capabilityId: "apply-collection-upgrade",
        input: {},
        inputDigest: "digest",
        idempotencyKey: "one",
        status: "queued",
        revision: 1,
        createdAt: "2026-11-01T00:00:00Z",
        updatedAt: "2026-11-01T00:00:00Z",
        context: {
            siteId: "site-a",
            providerId: "ulvia/primary-provider",
            requestId: crypto.randomUUID(),
            contractVersion: "1.0.0",
        },
    };
    await store.createOrGet(record);
    expect(await store.claim(record.id, 1, "lease-a", "2026-11-01T00:01:00Z", record.createdAt)).toBe(true);
    expect(
        await store.fail(
            record.id,
            "wrong-lease",
            "REVISION_CONFLICT",
            record.createdAt,
            { message: "Wrong write" },
            "fr",
        ),
    ).toBe(false);
    expect(await store.get("site-a", record.id)).toMatchObject({ status: "running" });
    expect(
        await store.fail(
            record.id,
            "lease-a",
            "REVISION_CONFLICT",
            record.createdAt,
            { message: "La selección ha cambiado." },
            "es",
        ),
    ).toBe(true);
    expect(await store.get("site-a", record.id)).toMatchObject({
        status: "failed",
        errorContentLanguage: "es",
        errorOutput: { message: "La selección ha cambiado." },
    });
    expect(await store.get("site-b", record.id)).toBeNull();
});
