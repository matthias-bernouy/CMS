import { expect, test } from "bun:test";
import type { Collection } from "mongodb";
import { MongoCollectionMigrationWriteFence } from "cms-repository/collections/installations/migrations/mongo/writeFence";

test("a normal write fails closed when its renewable permit disappears", async () => {
    let permit: { _id: string; siteId: string; expiresAt: Date } | null = null;
    let rejectRenewal = false;
    const permits = {
        insertOne: async (document: typeof permit) => {
            permit = document;
            return { acknowledged: true };
        },
        findOne: async () => permit,
        updateOne: async () => {
            if (rejectRenewal || !permit) {
                return { matchedCount: 0 };
            }
            permit.expiresAt = new Date(Date.now() + 100);
            return { matchedCount: 1 };
        },
        deleteOne: async () => {
            permit = null;
            return { deletedCount: 1 };
        },
    };
    const maintenance = { findOne: async () => null };
    const records = { findOne: async () => null };
    const fence = new MongoCollectionMigrationWriteFence(
        records as unknown as Collection<never>,
        maintenance as unknown as Collection<never>,
        permits as unknown as Collection<never>,
        { leaseMs: 100, heartbeatMs: 5 },
    );

    await expect(
        fence.withWrite("site", async () => {
            rejectRenewal = true;
            await Bun.sleep(15);
            return "must-not-commit";
        }),
    ).rejects.toMatchObject({ status: 409 });
    expect(permit).toBeNull();
});

test("a normal write surfaces heartbeat storage failures instead of ignoring them", async () => {
    let permit: { _id: string; siteId: string; expiresAt: Date } | null = null;
    const permits = {
        insertOne: async (document: typeof permit) => {
            permit = document;
            return { acknowledged: true };
        },
        findOne: async () => permit,
        updateOne: async () => {
            throw new Error("mongo unavailable");
        },
        deleteOne: async () => {
            permit = null;
            return { deletedCount: 1 };
        },
    };
    const fence = new MongoCollectionMigrationWriteFence(
        { findOne: async () => null } as unknown as Collection<never>,
        { findOne: async () => null } as unknown as Collection<never>,
        permits as unknown as Collection<never>,
        { leaseMs: 100, heartbeatMs: 5 },
    );

    await expect(
        fence.withWrite("site", async () => {
            await Bun.sleep(15);
        }),
    ).rejects.toMatchObject({ status: 503, message: expect.stringContaining("heartbeat failed") });
});

test("maintenance still waits for an in-process writer after its persisted permit is lost", async () => {
    let permit: { _id: string; siteId: string; expiresAt: Date } | null = null;
    let maintenance: { id: string; token: string; expiresAt: Date } | undefined;
    const permits = {
        insertOne: async (document: typeof permit) => {
            permit = document;
        },
        findOne: async () => permit,
        find: () => ({ toArray: async () => (permit ? [permit] : []) }),
        updateOne: async () => ({ matchedCount: permit ? 1 : 0 }),
        deleteOne: async () => {
            permit = null;
        },
        deleteMany: async () => {
            permit = null;
        },
    };
    const maintenanceCollection = {
        findOne: async () => (maintenance ? { _id: "site", maintenance } : null),
        insertOne: async (document: { maintenance: typeof maintenance }) => {
            maintenance = document.maintenance;
        },
        updateOne: async () => ({ matchedCount: 1 }),
    };
    const fence = new MongoCollectionMigrationWriteFence(
        { findOne: async () => null } as unknown as Collection<never>,
        maintenanceCollection as unknown as Collection<never>,
        permits as unknown as Collection<never>,
        { leaseMs: 100, heartbeatMs: 10 },
    );
    let finishWrite!: () => void;
    const writeCanFinish = new Promise<void>((resolve) => {
        finishWrite = resolve;
    });
    const write = fence.withWrite("site", async () => {
        permit = null;
        await writeCanFinish;
    });
    await Bun.sleep(1);
    let maintenanceClaimed = false;
    const claim = fence.claimMaintenance("site", "migration").then((claimed) => {
        maintenanceClaimed = claimed;
    });

    await Bun.sleep(20);
    expect(maintenanceClaimed).toBeFalse();
    finishWrite();
    await expect(write).rejects.toMatchObject({ status: 409 });
    await claim;
    expect(maintenanceClaimed).toBeTrue();
});
