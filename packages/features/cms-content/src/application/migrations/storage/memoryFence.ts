import type { CollectionMigrationWriteFence } from "../interfaces";

export class MemoryCollectionMigrationWriteFence implements CollectionMigrationWriteFence {
    private readonly maintenance = new Map<string, string>();
    private readonly writes = new Map<string, number>();
    private readonly drains = new Map<string, Set<() => void>>();

    async claimMaintenance(siteId: string, migrationId: string): Promise<boolean> {
        const owner = this.maintenance.get(siteId);
        if (owner && owner !== migrationId) {
            return false;
        }
        this.maintenance.set(siteId, migrationId);
        if ((this.writes.get(siteId) ?? 0) > 0) {
            await new Promise<void>((resolve) => {
                const waiters = this.drains.get(siteId) ?? new Set();
                waiters.add(resolve);
                this.drains.set(siteId, waiters);
            });
        }
        return true;
    }

    async releaseMaintenance(siteId: string, migrationId: string): Promise<void> {
        if (this.maintenance.get(siteId) === migrationId) {
            this.maintenance.delete(siteId);
        }
    }

    async yieldMaintenance(_siteId: string, _migrationId: string): Promise<void> {
        // The in-memory fence has no renewable lease; the journal remains authoritative.
    }

    async withWrite<T>(siteId: string, operation: () => Promise<T>): Promise<T> {
        if (this.maintenance.has(siteId)) {
            throw maintenanceError();
        }
        this.writes.set(siteId, (this.writes.get(siteId) ?? 0) + 1);
        if (this.maintenance.has(siteId)) {
            this.finishWrite(siteId);
            throw maintenanceError();
        }
        try {
            return await operation();
        } finally {
            this.finishWrite(siteId);
        }
    }

    private finishWrite(siteId: string): void {
        const remaining = Math.max(0, (this.writes.get(siteId) ?? 1) - 1);
        if (remaining > 0) {
            this.writes.set(siteId, remaining);
            return;
        }
        this.writes.delete(siteId);
        for (const resolve of this.drains.get(siteId) ?? []) {
            resolve();
        }
        this.drains.delete(siteId);
    }
}

function maintenanceError(): Error {
    return Object.assign(new Error("The site is temporarily read-only during a collection migration"), {
        status: 423,
    });
}
