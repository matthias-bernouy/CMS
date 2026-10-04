import { randomUUIDv7 } from "bun";
import type { CollectionStore } from "@bernouy/cms-repository/collections/installations";
import type { CmsRepository } from "cms-content/application/interfaces/CmsRepository";
import type {
    CollectionMigrationActive,
    CollectionMigrationAudit,
    CollectionMigrationParticipant,
    CollectionMigrationRecord,
    CollectionMigrationProgress,
    CollectionMigrationStorage,
    CollectionMigrationSummary,
    CollectionMigrationTarget,
} from "../interfaces";
import { prepareCollectionMigration } from "../plan";
import { runCollectionMigration } from "./execution";
import { summarizeMigration } from "./helpers";
import { MigrationJournal } from "./journal";
import { rollbackCollectionMigration } from "./rollback";

export class CollectionMigrationService {
    private readonly journal: MigrationJournal;
    private readonly participants: CollectionMigrationParticipant[] = [];
    private readonly running = new Set<string>();

    constructor(
        private readonly repository: CmsRepository,
        private readonly collections: CollectionStore,
        storage: CollectionMigrationStorage,
        options: CollectionMigrationServiceOptions = {},
    ) {
        this.journal = new MigrationJournal(storage, options);
    }

    addParticipant(participant: CollectionMigrationParticipant): void {
        if (!/^[a-z][a-z0-9-]{0,95}$/u.test(participant.id)) {
            throw new TypeError(`Invalid collection migration participant ID: ${participant.id}`);
        }
        if (this.participants.some(({ id }) => id === participant.id)) {
            throw new TypeError(`Duplicate collection migration participant: ${participant.id}`);
        }
        this.participants.push(participant);
    }

    getActive(siteId: string): Promise<CollectionMigrationActive | null> {
        return this.journal.getActive(siteId);
    }

    get(siteId: string, id: string): Promise<CollectionMigrationRecord | null> {
        return this.journal.get(siteId, id);
    }

    getProgress(siteId: string, id: string): Promise<CollectionMigrationProgress | null> {
        return this.journal.getProgress(siteId, id);
    }

    listAudits(siteId: string, limit = 100): Promise<readonly CollectionMigrationAudit[]> {
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
            throw new TypeError("Collection migration audit limit must be between 1 and 500");
        }
        return this.journal.listAudits(siteId, limit);
    }

    async plan(
        siteId: string,
        targets: readonly CollectionMigrationTarget[],
        expectedRevision?: number,
    ): Promise<CollectionMigrationSummary> {
        const plan = await prepareCollectionMigration(
            this.repository,
            this.collections,
            siteId,
            targets,
            expectedRevision,
            this.participants,
            { pagePreviewLimit: 500 },
        );
        return summarizeMigration(plan);
    }

    async execute(
        siteId: string,
        targets: readonly CollectionMigrationTarget[],
        expectedRevision?: number,
        expectedPlanDigest?: string,
    ): Promise<CollectionMigrationRecord> {
        const id = randomUUIDv7();
        const now = new Date().toISOString();
        if (!(await this.journal.begin(siteId, id))) {
            throw Object.assign(new Error("Another collection migration already owns maintenance mode"), {
                status: 423,
            });
        }
        let record: CollectionMigrationRecord;
        try {
            const prepared = await prepareCollectionMigration(
                this.repository,
                this.collections,
                siteId,
                targets,
                expectedRevision,
                this.participants,
                {
                    pagePreviewLimit: 0,
                    onPageChanges: (pages, start) => this.journal.stagePages(id, start, pages),
                },
            );
            if (expectedPlanDigest !== undefined && prepared.planDigest !== expectedPlanDigest) {
                throw Object.assign(new Error("The migration plan changed; review the new plan before executing it"), {
                    status: 409,
                });
            }
            if (prepared.blockedReasons.length) {
                throw Object.assign(new Error(`Migration is blocked: ${prepared.blockedReasons.join(" ")}`), {
                    status: 409,
                });
            }
            const { pages: _preview, ...plan } = prepared;
            record = {
                ...plan,
                id,
                revision: 1,
                status: "planning",
                createdAt: now,
                updatedAt: now,
            };
            if (!(await this.journal.create(record))) {
                throw Object.assign(new Error("Collection migration journal could not be activated"), {
                    status: 409,
                });
            }
        } catch (error) {
            await this.journal.discard(siteId, id);
            throw error;
        }
        return this.runExclusive(record.id, () => runCollectionMigration(this.context(), siteId, record.id));
    }

    async resume(siteId: string, id: string): Promise<CollectionMigrationRecord> {
        const record = await this.journal.require(siteId, id);
        if (record.status === "completed" || record.status === "rolled-back") {
            return record;
        }
        if (!(await this.journal.claim(record))) {
            throw Object.assign(new Error("Another collection migration already owns maintenance mode"), {
                status: 423,
            });
        }
        if (record.rollbackStartedAt || record.status === "rolling-back") {
            return this.runExclusive(record.id, () => rollbackCollectionMigration(this.context(), record));
        }
        return this.runExclusive(record.id, () => runCollectionMigration(this.context(), siteId, id));
    }

    async rollback(siteId: string, id: string): Promise<CollectionMigrationRecord> {
        const record = await this.journal.require(siteId, id);
        if (record.status === "rolled-back") {
            return record;
        }
        if (!(await this.journal.claim(record))) {
            throw Object.assign(new Error("Another migration already owns maintenance mode"), { status: 423 });
        }
        return this.runExclusive(record.id, () => rollbackCollectionMigration(this.context(), record));
    }

    private context() {
        return {
            repository: this.repository,
            collections: this.collections,
            journal: this.journal,
            participants: this.participants,
        };
    }

    private async runExclusive<T>(id: string, operation: () => Promise<T>): Promise<T> {
        if (this.running.has(id)) {
            throw Object.assign(new Error("This collection migration is already running"), { status: 423 });
        }
        this.running.add(id);
        try {
            return await operation();
        } finally {
            this.running.delete(id);
        }
    }
}

export type CollectionMigrationServiceOptions = {
    rollbackRetentionCount?: number;
    onRetentionError?: (error: Error) => void;
};
