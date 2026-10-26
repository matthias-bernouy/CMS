import type { SiteWriteFence } from "./interfaces";

export class MemorySiteWriteFence implements SiteWriteFence {
    private readonly maintenance = new Map<string, string>();
    private readonly writes = new Map<string, number>();
    private readonly drains = new Map<string, Set<() => void>>();

    async claimMaintenance(siteId: string, upgradeId: string): Promise<boolean> {
        const owner = this.maintenance.get(siteId);
        if (owner && owner !== upgradeId) {
            return false;
        }
        this.maintenance.set(siteId, upgradeId);
        if ((this.writes.get(siteId) ?? 0) > 0) {
            await new Promise<void>((resolve) => {
                const waiters = this.drains.get(siteId) ?? new Set();
                waiters.add(resolve);
                this.drains.set(siteId, waiters);
            });
        }
        return true;
    }

    async releaseMaintenance(siteId: string, upgradeId: string): Promise<void> {
        if (this.maintenance.get(siteId) === upgradeId) {
            this.maintenance.delete(siteId);
        }
    }

    async assertMaintenance(siteId: string, upgradeId: string): Promise<void> {
        if (this.maintenance.get(siteId) !== upgradeId) {
            throw leaseLostError();
        }
    }

    async yieldMaintenance(_siteId: string, _upgradeId: string): Promise<void> {
        // The in-memory fence has no renewable lease; the pending intent remains authoritative.
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
    return Object.assign(new Error("The site is temporarily read-only during a site upgrade"), {
        status: 423,
    });
}

function leaseLostError(): Error {
    return Object.assign(new Error("Site upgrade maintenance ownership was lost"), { status: 409 });
}
