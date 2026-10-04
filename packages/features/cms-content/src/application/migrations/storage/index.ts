import type {
    CollectionMigrationActive,
    CollectionMigrationPageChange,
    CollectionMigrationProgress,
    CollectionMigrationRecord,
    CollectionMigrationStorage,
} from "../interfaces";

const TERMINAL = new Set(["completed", "rolled-back"]);

export class MemoryCollectionMigrationStorage implements CollectionMigrationStorage {
    private readonly records = new Map<string, CollectionMigrationRecord>();
    private readonly maintenance = new Map<string, string>();
    private readonly writes = new Map<string, number>();
    private readonly drains = new Map<string, Set<() => void>>();

    async get(id: string): Promise<CollectionMigrationRecord | null> {
        return structuredClone(this.records.get(id) ?? null);
    }

    async getActive(siteId: string): Promise<CollectionMigrationActive | null> {
        const active = [...this.records.values()]
            .filter((record) => record.siteId === siteId && !TERMINAL.has(record.status))
            .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
        return active
            ? { id: active.id, siteId: active.siteId, status: active.status, updatedAt: active.updatedAt }
            : null;
    }

    async getProgress(id: string): Promise<CollectionMigrationProgress | null> {
        const record = this.records.get(id);
        return record ? progressOf(record) : null;
    }

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
        // In-memory ownership has no lease to renew; the journal remains the lock authority.
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

    async create(record: CollectionMigrationRecord): Promise<boolean> {
        if (
            this.records.has(record.id) ||
            [...this.records.values()].some(
                (current) => current.siteId === record.siteId && !TERMINAL.has(current.status),
            )
        ) {
            return false;
        }
        this.records.set(record.id, structuredClone(record));
        return true;
    }

    async replace(id: string, expectedRevision: number, next: CollectionMigrationRecord): Promise<boolean> {
        const current = this.records.get(id);
        if (!current || current.revision !== expectedRevision || next.revision !== expectedRevision + 1) {
            return false;
        }
        if (
            !TERMINAL.has(next.status) &&
            [...this.records.values()].some(
                (record) => record.id !== id && record.siteId === next.siteId && !TERMINAL.has(record.status),
            )
        ) {
            return false;
        }
        this.records.set(id, { ...structuredClone(next), pages: structuredClone(current.pages) });
        return true;
    }

    async replacePage(
        id: string,
        pageId: string,
        expectedState: CollectionMigrationPageChange["state"],
        next: CollectionMigrationPageChange,
    ): Promise<boolean> {
        const record = this.records.get(id);
        const index = record?.pages.findIndex((change) => change.before.id === pageId) ?? -1;
        if (!record || index < 0 || record.pages[index]?.state !== expectedState) {
            return false;
        }
        const pages = [...record.pages];
        pages[index] = structuredClone(next);
        this.records.set(id, { ...record, pages });
        return true;
    }

    async pruneTerminal(siteId: string, keep: number): Promise<void> {
        const retained = [...this.records.values()]
            .filter((record) => record.siteId === siteId && TERMINAL.has(record.status))
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
            .slice(0, Math.max(0, keep));
        const retainedIds = new Set(retained.map(({ id }) => id));
        for (const [id, record] of this.records) {
            if (record.siteId === siteId && TERMINAL.has(record.status) && !retainedIds.has(id)) {
                this.records.delete(id);
            }
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

export function isCollectionMigrationActive(record: CollectionMigrationActive | null): boolean {
    return !!record && !TERMINAL.has(record.status);
}

function progressOf(record: CollectionMigrationRecord): CollectionMigrationProgress {
    return {
        id: record.id,
        siteId: record.siteId,
        status: record.status,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        ...(record.error ? { error: record.error } : {}),
        totalPages: record.pages.length,
        pendingPages: record.pages.filter(({ state }) => state === "pending").length,
        appliedPages: record.pages.filter(({ state }) => state === "applied").length,
        rolledBackPages: record.pages.filter(({ state }) => state === "rolled-back").length,
    };
}

function maintenanceError(): Error {
    return Object.assign(new Error("The site is temporarily read-only during a collection migration"), {
        status: 423,
    });
}
