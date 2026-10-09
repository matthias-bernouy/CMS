import type {
    CollectionMigrationActive,
    CollectionMigrationAudit,
    CollectionMigrationPageChange,
    CollectionMigrationProgress,
    CollectionMigrationRecord,
    CollectionMigrationStorage,
} from "../interfaces";
import { auditProgress, migrationAudit } from "./audit";
import { MemoryCollectionMigrationWriteFence } from "./memoryFence";

const TERMINAL = new Set(["completed", "rolled-back"]);

export class MemoryCollectionMigrationStorage implements CollectionMigrationStorage {
    private readonly records = new Map<string, CollectionMigrationRecord>();
    private readonly pages = new Map<string, CollectionMigrationPageChange[]>();
    private readonly audits = new Map<string, CollectionMigrationAudit>();
    private readonly fence = new MemoryCollectionMigrationWriteFence();

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
        if (record) {
            return progressOfPages(record, this.pages.get(id) ?? []);
        }
        const audit = this.audits.get(id);
        return audit ? auditProgress(audit) : null;
    }

    async listAudits(siteId: string, limit: number): Promise<readonly CollectionMigrationAudit[]> {
        return [...this.audits.values()]
            .filter((audit) => audit.siteId === siteId)
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
            .slice(0, limit)
            .map((audit) => structuredClone(audit));
    }

    async claimMaintenance(siteId: string, migrationId: string): Promise<boolean> {
        return this.fence.claimMaintenance(siteId, migrationId);
    }

    async releaseMaintenance(siteId: string, migrationId: string): Promise<void> {
        await this.fence.releaseMaintenance(siteId, migrationId);
    }

    async assertMaintenance(siteId: string, migrationId: string): Promise<void> {
        await this.fence.assertMaintenance(siteId, migrationId);
    }

    async yieldMaintenance(siteId: string, migrationId: string): Promise<void> {
        await this.fence.yieldMaintenance(siteId, migrationId);
    }

    async withWrite<T>(siteId: string, operation: () => Promise<T>): Promise<T> {
        return this.fence.withWrite(siteId, operation);
    }

    async stagePageBatch(id: string, start: number, pages: readonly CollectionMigrationPageChange[]): Promise<void> {
        const staged = this.pages.get(id) ?? [];
        if (start !== staged.length) {
            throw new Error("Collection migration pages were staged out of order");
        }
        staged.push(...structuredClone([...pages]));
        this.pages.set(id, staged);
    }

    async discardPageStage(id: string): Promise<void> {
        if (!this.records.has(id)) {
            this.pages.delete(id);
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
        if ((this.pages.get(record.id)?.length ?? 0) !== record.pageCount) {
            throw new Error("Collection migration page count is inconsistent");
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
        this.records.set(id, structuredClone(next));
        return true;
    }

    async getPageBatch(id: string, start: number, limit: number): Promise<readonly CollectionMigrationPageChange[]> {
        if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
            throw new TypeError("Invalid collection migration page range");
        }
        return structuredClone((this.pages.get(id) ?? []).slice(start, start + limit));
    }

    async replacePage(
        id: string,
        pageId: string,
        expectedState: CollectionMigrationPageChange["state"],
        next: CollectionMigrationPageChange,
    ): Promise<boolean> {
        const record = this.records.get(id);
        const pages = this.pages.get(id);
        const index = pages?.findIndex((change) => change.before.id === pageId) ?? -1;
        if (!record || !pages || index < 0 || pages[index]?.state !== expectedState) {
            return false;
        }
        pages[index] = structuredClone(next);
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
                this.audits.set(id, migrationAudit(record));
                this.records.delete(id);
                this.pages.delete(id);
            }
        }
    }

    async archiveTerminal(record: CollectionMigrationRecord): Promise<void> {
        const audit = migrationAudit(record);
        this.audits.set(audit.id, audit);
    }
}

export function isCollectionMigrationActive(record: CollectionMigrationActive | null): boolean {
    return !!record && !TERMINAL.has(record.status);
}

function progressOfPages(
    record: CollectionMigrationRecord,
    pages: readonly CollectionMigrationPageChange[],
): CollectionMigrationProgress {
    return {
        id: record.id,
        siteId: record.siteId,
        status: record.status,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        ...(record.error ? { error: record.error } : {}),
        totalPages: record.pageCount,
        pendingPages: pages.filter(({ state }) => state === "pending").length,
        appliedPages: pages.filter(({ state }) => state === "applied").length,
        rolledBackPages: pages.filter(({ state }) => state === "rolled-back").length,
    };
}
