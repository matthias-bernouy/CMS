import type {
    CollectionMigrationActive,
    CollectionMigrationAudit,
    CollectionMigrationRecord,
    CollectionMigrationProgress,
    CollectionMigrationStatus,
    CollectionMigrationStorage,
} from "../interfaces";
import type { CollectionMigrationServiceOptions } from "./CollectionMigrationService";

export class MigrationJournal {
    private readonly rollbackRetentionCount: number;
    private readonly onRetentionError: (error: Error) => void;

    constructor(
        private readonly storage: CollectionMigrationStorage,
        options: CollectionMigrationServiceOptions = {},
    ) {
        const retention = options.rollbackRetentionCount ?? 100;
        if (!Number.isSafeInteger(retention) || retention < 0 || retention > 10_000) {
            throw new TypeError("Collection migration rollback retention must be between 0 and 10000");
        }
        this.rollbackRetentionCount = retention;
        this.onRetentionError = options.onRetentionError ?? (() => undefined);
    }

    getActive(siteId: string): Promise<CollectionMigrationActive | null> {
        return this.storage.getActive(siteId);
    }

    async getProgress(siteId: string, id: string): Promise<CollectionMigrationProgress | null> {
        const progress = await this.storage.getProgress(id);
        return progress?.siteId === siteId ? progress : null;
    }

    current(id: string): Promise<CollectionMigrationRecord | null> {
        return this.storage.get(id);
    }

    async get(siteId: string, id: string): Promise<CollectionMigrationRecord | null> {
        const record = await this.storage.get(id);
        return record?.siteId === siteId ? record : null;
    }

    listAudits(siteId: string, limit: number): Promise<readonly CollectionMigrationAudit[]> {
        return this.storage.listAudits(siteId, limit);
    }

    async require(siteId: string, id: string): Promise<CollectionMigrationRecord> {
        const record = await this.get(siteId, id);
        if (!record) {
            throw Object.assign(new Error("Unknown collection migration"), { status: 404 });
        }
        return record;
    }

    async create(record: CollectionMigrationRecord): Promise<boolean> {
        if (!(await this.storage.claimMaintenance(record.siteId, record.id))) {
            return false;
        }
        try {
            if (await this.storage.create(record)) {
                return true;
            }
        } catch (error) {
            await this.storage.releaseMaintenance(record.siteId, record.id);
            throw error;
        }
        await this.storage.releaseMaintenance(record.siteId, record.id);
        return false;
    }

    claim(record: Pick<CollectionMigrationRecord, "id" | "siteId">): Promise<boolean> {
        return this.storage.claimMaintenance(record.siteId, record.id);
    }

    transition(
        record: CollectionMigrationRecord,
        status: CollectionMigrationStatus,
        patch: Partial<CollectionMigrationRecord> = {},
    ): Promise<CollectionMigrationRecord> {
        return this.replace(record, { ...patch, status });
    }

    async replace(
        record: CollectionMigrationRecord,
        patch: Partial<CollectionMigrationRecord>,
    ): Promise<CollectionMigrationRecord> {
        const next = {
            ...record,
            ...patch,
            revision: record.revision + 1,
            updatedAt: new Date().toISOString(),
        };
        if (!(await this.storage.replace(record.id, record.revision, next))) {
            throw Object.assign(new Error("Migration journal changed concurrently"), { status: 409 });
        }
        if (next.status === "completed" || next.status === "rolled-back") {
            await this.storage.releaseMaintenance(next.siteId, next.id).catch(() => undefined);
            try {
                await this.storage.archiveTerminal(next);
                void this.storage
                    .pruneTerminal(next.siteId, this.rollbackRetentionCount)
                    .catch((error) => this.onRetentionError(safeError(error)));
            } catch (error) {
                this.onRetentionError(safeError(error));
            }
        }
        return next;
    }

    async persistPage(
        record: CollectionMigrationRecord,
        current: CollectionMigrationRecord["pages"][number],
        next: CollectionMigrationRecord["pages"][number],
    ): Promise<void> {
        if (!(await this.storage.replacePage(record.id, current.before.id, current.state, next))) {
            throw Object.assign(new Error("Migration page journal changed concurrently"), { status: 409 });
        }
        Object.assign(current, next);
    }

    async fail(record: CollectionMigrationRecord, error: unknown): Promise<void> {
        const current = (await this.storage.get(record.id)) ?? record;
        if (current.status === "completed" || current.status === "rolled-back") {
            return;
        }
        await this.storage.replace(current.id, current.revision, {
            ...current,
            revision: current.revision + 1,
            status: "failed",
            updatedAt: new Date().toISOString(),
            error: error instanceof Error ? error.message : "Unknown migration failure",
        });
        await this.storage.yieldMaintenance(current.siteId, current.id).catch(() => undefined);
    }
}

function safeError(error: unknown): Error {
    return error instanceof Error ? error : new Error("Unknown collection migration retention failure");
}
