import type {
    CollectionMigrationPageChange,
    CollectionMigrationActive,
    CollectionMigrationRecord,
    CollectionMigrationStorage,
} from "./interfaces";

const TERMINAL = new Set(["completed", "rolled-back"]);

export class MemoryCollectionMigrationStorage implements CollectionMigrationStorage {
    private readonly records = new Map<string, CollectionMigrationRecord>();

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
}

export function isCollectionMigrationActive(record: CollectionMigrationActive | null): boolean {
    return !!record && !TERMINAL.has(record.status);
}
