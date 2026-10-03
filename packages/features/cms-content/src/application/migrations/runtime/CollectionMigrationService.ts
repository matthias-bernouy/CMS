import { randomUUIDv7 } from "bun";
import type { CollectionStore } from "@bernouy/cms-repository/collections/installations";
import type { CmsRepository } from "cms-content/application/interfaces/CmsRepository";
import type {
    CollectionMigrationActive,
    CollectionMigrationRecord,
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

    constructor(
        private readonly repository: CmsRepository,
        private readonly collections: CollectionStore,
        storage: CollectionMigrationStorage,
    ) {
        this.journal = new MigrationJournal(storage);
    }

    getActive(siteId: string): Promise<CollectionMigrationActive | null> {
        return this.journal.getActive(siteId);
    }

    get(siteId: string, id: string): Promise<CollectionMigrationRecord | null> {
        return this.journal.get(siteId, id);
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
        );
        return summarizeMigration(plan);
    }

    async execute(
        siteId: string,
        targets: readonly CollectionMigrationTarget[],
        expectedRevision?: number,
    ): Promise<CollectionMigrationRecord> {
        const prepared = await prepareCollectionMigration(
            this.repository,
            this.collections,
            siteId,
            targets,
            expectedRevision,
        );
        if (prepared.blockedReasons.length) {
            throw Object.assign(new Error(`Migration is blocked: ${prepared.blockedReasons.join(" ")}`), {
                status: 409,
            });
        }
        const now = new Date().toISOString();
        const record: CollectionMigrationRecord = {
            ...prepared,
            id: randomUUIDv7(),
            revision: 1,
            status: "planning",
            createdAt: now,
            updatedAt: now,
        };
        if (!(await this.journal.create(record))) {
            throw Object.assign(new Error("Another collection migration already owns maintenance mode"), {
                status: 423,
            });
        }
        return runCollectionMigration(this.context(), siteId, record.id);
    }

    async resume(siteId: string, id: string): Promise<CollectionMigrationRecord> {
        const record = await this.journal.require(siteId, id);
        if (record.status === "completed" || record.status === "rolled-back") {
            return record;
        }
        if (record.rollbackStartedAt || record.status === "rolling-back") {
            return rollbackCollectionMigration(this.context(), record);
        }
        return runCollectionMigration(this.context(), siteId, id);
    }

    async rollback(siteId: string, id: string): Promise<CollectionMigrationRecord> {
        const record = await this.journal.require(siteId, id);
        if (record.status === "rolled-back") {
            return record;
        }
        if (record.status === "completed") {
            const active = await this.journal.getActive(record.siteId);
            if (active && active.id !== record.id) {
                throw Object.assign(new Error("Another migration already owns maintenance mode"), { status: 423 });
            }
        }
        return rollbackCollectionMigration(this.context(), record);
    }

    private context() {
        return { repository: this.repository, collections: this.collections, journal: this.journal };
    }
}
