import { randomUUIDv7 } from "bun";
import type { Collection } from "mongodb";
import type { TSystem } from "cms-content/interfaces/settings";
import { defaultSystem, mergeSystemUpdate } from "cms-content/core/lifecycle/system";
import { SYSTEM_ID, type SystemDoc } from "cms-content/default-implementation/repositories/mongo/documents";

type Systems = Collection<SystemDoc>;
const WRITE_LEASE_MS = 30_000;
const WRITE_RENEW_MS = 5_000;
const WAIT_ATTEMPTS = 900;
const WAIT_DELAY_MS = 50;
const liveWriteTokens = new Set<string>();

/** Initialize old system records without overwriting a concurrent writer's counter. */
export async function readSystemDocument(systems: Systems): Promise<SystemDoc> {
    let document = await systems.findOne({ _id: SYSTEM_ID });
    if (!document) {
        try {
            await systems.insertOne({ _id: SYSTEM_ID, ...defaultSystem(), settingsRevision: 0, activePageWrites: 0 });
        } catch (error) {
            if ((error as { code?: unknown } | null)?.code !== 11000) {
                throw error;
            }
        }
        document = await systems.findOne({ _id: SYSTEM_ID });
    }
    if (!document) {
        throw new Error("System settings are unavailable.");
    }
    const needsRevision = document.settingsRevision === undefined;
    const needsCounter = document.activePageWrites === undefined;
    if (needsRevision) {
        await systems.updateOne(
            { _id: SYSTEM_ID, settingsRevision: { $exists: false } },
            { $set: { settingsRevision: 0 } },
        );
    }
    if (needsCounter) {
        await systems.updateOne(
            { _id: SYSTEM_ID, activePageWrites: { $exists: false } },
            { $set: { activePageWrites: 0 } },
        );
    }
    return needsRevision || needsCounter ? (await systems.findOne({ _id: SYSTEM_ID }))! : document;
}

export function systemFromDocument(document: SystemDoc): TSystem {
    const {
        _id: _id,
        routeMigration,
        settingsRevision: _revision,
        activePageWrites: _writes,
        activePageWritePermits: _permits,
        pageDeletionLock: _deletionLock,
        ...stored
    } = document;
    const rest = stored as Partial<TSystem> & { editor?: unknown };
    delete rest.editor;
    const system = mergeSystemUpdate(defaultSystem(), rest);
    return routeMigration ? { ...system, pageRoutesUpdating: true } : system;
}

/** Each route writer owns a renewable permit in the same document migration claims atomically. */
export async function withPageRouteWrite<T>(
    systems: Systems,
    write: (system: TSystem, permitToken: string) => Promise<T>,
): Promise<T> {
    await readSystemDocument(systems);
    const token = randomUUIDv7();
    const permitPath = `activePageWritePermits.${token}`;
    const claimed = await systems.updateOne(
        { _id: SYSTEM_ID, routeMigration: { $exists: false } },
        { $set: { [permitPath]: new Date(Date.now() + WRITE_LEASE_MS) }, $inc: { activePageWrites: 1 } },
    );
    if (!claimed.matchedCount) {
        throw new Error("Page route migration is in progress.");
    }
    liveWriteTokens.add(token);
    const renewal = setInterval(() => {
        void systems
            .updateOne(
                { _id: SYSTEM_ID, [permitPath]: { $exists: true } },
                { $set: { [permitPath]: new Date(Date.now() + WRITE_LEASE_MS) } },
            )
            .catch(() => undefined);
    }, WRITE_RENEW_MS);
    renewal.unref();
    try {
        return await write(systemFromDocument(await readSystemDocument(systems)), token);
    } finally {
        clearInterval(renewal);
        try {
            await systems.updateOne(
                { _id: SYSTEM_ID, [permitPath]: { $exists: true } },
                { $set: {}, $unset: { [permitPath]: "" }, $inc: { activePageWrites: -1 } },
            );
        } finally {
            liveWriteTokens.delete(token);
        }
    }
}

export async function reapExpiredPageWrites(systems: Systems): Promise<SystemDoc> {
    const current = await readSystemDocument(systems);
    const permits = current.activePageWritePermits ?? {};
    if (current.activePageWrites && !current.activePageWritePermits && liveWriteTokens.size === 0) {
        await systems.updateOne(
            { _id: SYSTEM_ID, activePageWritePermits: { $exists: false }, activePageWrites: current.activePageWrites },
            { $set: { activePageWrites: 0 }, $unset: { pageDeletionLock: "" } },
        );
    }
    for (const [token, expiresAt] of Object.entries(permits)) {
        if (liveWriteTokens.has(token) || new Date(expiresAt).getTime() > Date.now()) {
            continue;
        }
        const permitPath = `activePageWritePermits.${token}`;
        await systems.updateOne(
            { _id: SYSTEM_ID, [permitPath]: expiresAt },
            {
                $set: {},
                $unset: { [permitPath]: "" },
                $inc: { activePageWrites: -1 },
            },
        );
    }
    const updated = await readSystemDocument(systems);
    if (updated.pageDeletionLock && !updated.activePageWritePermits?.[updated.pageDeletionLock]) {
        await systems.updateOne(
            { _id: SYSTEM_ID, pageDeletionLock: updated.pageDeletionLock },
            { $set: {}, $unset: { pageDeletionLock: "" } },
        );
        return readSystemDocument(systems);
    }
    return updated;
}

/** Only one deletion may resolve and rewrite replacement routes at a time. */
export async function withPageDeletionLock<T>(
    systems: Systems,
    token: string,
    deletePage: () => Promise<T>,
): Promise<T> {
    for (let attempt = 0; attempt < WAIT_ATTEMPTS; attempt++) {
        const claimed = await systems.updateOne(
            {
                _id: SYSTEM_ID,
                pageDeletionLock: { $exists: false },
                [`activePageWritePermits.${token}`]: { $exists: true },
            },
            { $set: { pageDeletionLock: token } },
        );
        if (claimed.matchedCount) {
            try {
                return await deletePage();
            } finally {
                await systems.updateOne(
                    { _id: SYSTEM_ID, pageDeletionLock: token },
                    { $set: {}, $unset: { pageDeletionLock: "" } },
                );
            }
        }
        await reapExpiredPageWrites(systems);
        await new Promise((resolve) => setTimeout(resolve, WAIT_DELAY_MS));
    }
    throw new Error("Another page deletion did not finish.");
}
