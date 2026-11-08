import type { SiteUpgradeIntent, SiteUpgradeStorage } from "./interfaces";

const running = new WeakMap<SiteUpgradeStorage, Map<string, Promise<SiteUpgradeIntent<unknown>>>>();
export type UpgradeExecution<T> = Readonly<{
    validatePrepared(intent: SiteUpgradeIntent<T>): Promise<boolean>;
    stateDigest(): Promise<string>;
    commit(intent: SiteUpgradeIntent<T>, assertLease: () => Promise<void>): Promise<unknown>;
    onCommitted?(): Promise<void>;
}>;

/** Recover an exact one-CAS state switch. An unresolved write never releases its maintenance fence. */
export function runSiteUpgrade<T>(
    storage: SiteUpgradeStorage,
    intent: SiteUpgradeIntent<T>,
    execution: UpgradeExecution<T>,
): Promise<SiteUpgradeIntent<T>> {
    const operations = running.get(storage) ?? new Map();
    running.set(storage, operations);
    const existing = operations.get(intent.id);
    if (existing) {
        return existing as Promise<SiteUpgradeIntent<T>>;
    }
    const pending = runOwned(storage, intent, execution).finally(() => operations.delete(intent.id));
    operations.set(intent.id, pending);
    return pending;
}

async function runOwned<T>(
    storage: SiteUpgradeStorage,
    intent: SiteUpgradeIntent<T>,
    execution: UpgradeExecution<T>,
): Promise<SiteUpgradeIntent<T>> {
    const { siteId, id, kind } = intent;
    if (["completed", "cancelled"].includes(intent.status)) {
        return intent;
    }
    if (!(await storage.claimMaintenance(siteId, id))) {
        throw conflict("Another worker owns this site upgrade");
    }
    try {
        let current = (await storage.get<T>(siteId, id, kind))!;
        if (current.status === "prepared") {
            if (!(await execution.validatePrepared(current))) {
                await storage.transition(siteId, id, "prepared", "cancelled");
                throw conflict("The reviewed upgrade plan is no longer current");
            }
            await storage.assertMaintenance(siteId, id);
            await storage.transition(siteId, id, "prepared", "applying");
            current = { ...current, status: "applying" };
        }
        const digest = await execution.stateDigest();
        if (digest !== current.targetStateDigest) {
            if (digest !== current.sourceStateDigest) {
                await storage.transition(siteId, id, "applying", "cancelled");
                throw conflict("Site state changed outside the reviewed upgrade");
            }
            try {
                await execution.commit(current, () => storage.assertMaintenance(siteId, id));
            } catch (error) {
                if ((await execution.stateDigest()) !== current.targetStateDigest) {
                    throw error;
                }
            }
        }
        if ((await execution.stateDigest()) !== current.targetStateDigest) {
            throw conflict("Upgrade commit outcome is unresolved");
        }
        await execution.onCommitted?.();
        await storage.assertMaintenance(siteId, id);
        await storage.transition(siteId, id, "applying", "completed");
        return (await storage.get<T>(siteId, id, kind))!;
    } finally {
        const current = await storage.get<T>(siteId, id, kind);
        if (current && ["completed", "cancelled"].includes(current.status)) {
            await storage.releaseMaintenance(siteId, id);
        } else {
            await storage.yieldMaintenance(siteId, id);
        }
    }
}
function conflict(message: string): Error {
    return Object.assign(new Error(message), { status: 409 });
}
