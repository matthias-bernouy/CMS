import { validateUpgradeIntent, sameUpgradeIntent } from "./validation";
import type { SiteUpgradeStorage, SiteUpgradeIntent, SiteUpgradeActive } from "./interfaces";
import { MemorySiteWriteFence } from "./memoryFence";

export class MemorySiteUpgradeStorage extends MemorySiteWriteFence implements SiteUpgradeStorage {
    private readonly records = new Map<string, SiteUpgradeIntent<unknown>>();
    async begin<T>(intent: SiteUpgradeIntent<T>): Promise<SiteUpgradeIntent<T>> {
        validateUpgradeIntent(intent);
        const existing = this.records.get(intent.id);
        if (existing) {
            if (!sameUpgradeIntent(existing, intent)) {
                throw new TypeError("Upgrade intent identity is immutable");
            }
            return structuredClone(existing) as SiteUpgradeIntent<T>;
        }
        if (
            [...this.records.values()].some(
                (record) => record.siteId === intent.siteId && ["prepared", "applying"].includes(record.status),
            )
        ) {
            throw Object.assign(new Error("Another site upgrade is pending"), { status: 423 });
        }
        this.records.set(intent.id, structuredClone(intent));
        return structuredClone(intent);
    }
    async get<T>(siteId: string, id: string, kind: string): Promise<SiteUpgradeIntent<T> | null> {
        const record = this.records.get(id);
        return record?.siteId === siteId && record.kind === kind
            ? (structuredClone(record) as SiteUpgradeIntent<T>)
            : null;
    }
    async getActive(siteId: string): Promise<SiteUpgradeActive | null> {
        return structuredClone(
            [...this.records.values()].find(
                (record) => record.siteId === siteId && ["prepared", "applying"].includes(record.status),
            ) ?? null,
        );
    }
    async transition(
        siteId: string,
        id: string,
        from: SiteUpgradeActive["status"],
        to: SiteUpgradeActive["status"],
    ): Promise<void> {
        const record = this.records.get(id);
        if (!record || record.siteId !== siteId || record.status !== from) {
            throw Object.assign(new Error("Site upgrade intent changed"), { status: 409 });
        }
        this.records.set(id, { ...record, status: to });
    }
}
