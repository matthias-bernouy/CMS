import type { CollectionStore } from "@bernouy/cms-repository/collections/installations";
import { isDeepStrictEqual } from "node:util";
import type { CmsRepository } from "cms-content/application/interfaces/CmsRepository";
import type { CollectionMigrationRecord } from "../interfaces";
import { collectionPageRevisionDigest } from "../plan";
import { installationsMatch, migrationTargetsMatch } from "./helpers";
import type { MigrationJournal } from "./journal";

type ExecutionContext = {
    repository: CmsRepository;
    collections: CollectionStore;
    journal: MigrationJournal;
};

export async function runCollectionMigration(
    context: ExecutionContext,
    siteId: string,
    id: string,
): Promise<CollectionMigrationRecord> {
    let record = await context.journal.require(siteId, id);
    try {
        const state = await context.collections.snapshot(record.siteId);
        if (
            state.revision === record.expectedCollectionRevision &&
            installationsMatch(state.collections, record.installationsBefore)
        ) {
            record = await context.journal.transition(record, "snapshotting");
            await assertSnapshotCurrent(context, record);
            record = await context.journal.transition(record, "committing");
            await context.collections.commitMigration(
                record.siteId,
                record.replacements,
                record.expectedCollectionRevision,
            );
        } else if (
            state.revision !== record.expectedCollectionRevision + 1 ||
            !migrationTargetsMatch(state.collections, record)
        ) {
            throw new Error("Collection state changed during migration");
        }
        if (record.collectionRevisionAfterCommit !== record.expectedCollectionRevision + 1) {
            record = await context.journal.replace(record, {
                collectionRevisionAfterCommit: record.expectedCollectionRevision + 1,
            });
        }
        record = await context.journal.transition(record, "migrating");
        await migratePages(context, record);
        record = await context.journal.transition(record, "validating");
        await assertPagesApplied(context.repository, record);
        await applySystemMigration(context.repository, record);
        return context.journal.transition(record, "completed");
    } catch (error) {
        if (await cancelUnstarted(context, record, error)) {
            throw error;
        }
        await context.journal.fail(record, error);
        throw error;
    }
}

async function applySystemMigration(repository: CmsRepository, record: CollectionMigrationRecord): Promise<void> {
    const current = await repository.getSystem();
    if (isDeepStrictEqual(current, record.systemAfter)) {
        return;
    }
    if (!isDeepStrictEqual(current, record.systemBefore)) {
        throw new Error("System settings changed during migration");
    }
    await repository.updateSystem(record.systemAfter);
}

async function migratePages(context: ExecutionContext, record: CollectionMigrationRecord): Promise<void> {
    for (const change of record.pages) {
        const current = await context.repository.getPageById(change.before.id);
        if (!current) {
            throw new Error(`Page disappeared during migration: ${change.before.id}`);
        }
        if (change.state === "applied") {
            if (current.revision !== change.appliedRevision || current.content !== change.afterContent) {
                throw new Error(`Migrated page changed unexpectedly: ${change.before.id}`);
            }
            continue;
        }
        if (current.revision === change.before.revision + 1 && current.content === change.afterContent) {
            await context.journal.persistPage(record, change, {
                ...change,
                state: "applied",
                appliedRevision: current.revision,
            });
        } else if (current.revision === change.before.revision && current.content === change.before.content) {
            const updated = await context.repository.updatePage(
                { id: current.id, content: change.afterContent },
                current.revision,
            );
            if (!updated) {
                throw new Error(`Page disappeared during migration: ${current.id}`);
            }
            await context.journal.persistPage(record, change, {
                ...change,
                state: "applied",
                appliedRevision: updated.revision,
            });
        } else {
            throw new Error(`Page revision changed during migration: ${change.before.id}`);
        }
    }
}

async function assertPagesApplied(repository: CmsRepository, record: CollectionMigrationRecord): Promise<void> {
    for (const change of record.pages) {
        const page = await repository.getPageById(change.before.id);
        if (!page || page.revision !== change.appliedRevision || page.content !== change.afterContent) {
            throw new Error(`Migrated page failed validation: ${change.before.id}`);
        }
    }
}

async function assertSnapshotCurrent(context: ExecutionContext, record: CollectionMigrationRecord): Promise<void> {
    const [state, pages, system] = await Promise.all([
        context.collections.snapshot(record.siteId),
        context.repository.getAllPages(),
        context.repository.getSystem(),
    ]);
    if (
        state.revision !== record.expectedCollectionRevision ||
        !installationsMatch(state.collections, record.installationsBefore) ||
        collectionPageRevisionDigest(pages) !== record.pageRevisionDigest ||
        !isDeepStrictEqual(system, record.systemBefore)
    ) {
        throw Object.assign(new Error("Site content changed while the migration plan was being acquired; retry"), {
            status: 409,
        });
    }
}

async function cancelUnstarted(
    context: ExecutionContext,
    record: CollectionMigrationRecord,
    error: unknown,
): Promise<boolean> {
    const current = (await context.journal.current(record.id)) ?? record;
    if (current.pages.some((page) => page.state !== "pending")) {
        return false;
    }
    const state = await context.collections.snapshot(current.siteId);
    if (
        state.revision === current.expectedCollectionRevision + 1 &&
        migrationTargetsMatch(state.collections, current)
    ) {
        return false;
    }
    await context.journal.replace(current, {
        status: "rolled-back",
        error: error instanceof Error ? error.message : "Migration plan became stale",
    });
    return true;
}
