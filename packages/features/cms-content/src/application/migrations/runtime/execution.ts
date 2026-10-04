import type { CollectionStore } from "@bernouy/cms-repository/collections/installations";
import { isDeepStrictEqual } from "node:util";
import type { CmsRepository } from "cms-content/application/interfaces/CmsRepository";
import type { CollectionMigrationRecord } from "../interfaces";
import type { CollectionMigrationParticipant } from "../interfaces";
import { collectionSiteResourceDigest } from "../plan";
import { collectionPageRevisionDigestFromRepository } from "../planning/pageScan";
import { snapshotMigrationParticipants } from "../planning/participants";
import { forEachMigrationPage, migrationPageBatches } from "./concurrency";
import {
    installationsMatch,
    migrationTargetsMatch,
    migrationTargetSnapshot,
    prepareMigrationParticipants,
} from "./helpers";
import type { MigrationJournal } from "./journal";

type ExecutionContext = {
    repository: CmsRepository;
    collections: CollectionStore;
    journal: MigrationJournal;
    participants: readonly CollectionMigrationParticipant[];
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
            await prepareMigrationParticipants(
                context.participants,
                record.siteId,
                await migrationTargetSnapshot(context.collections, record, "after"),
            );
            record = await context.journal.transition(record, "committing");
            await context.journal.assertOwnership(record);
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
        } else if (record.status === "planning") {
            throw Object.assign(new Error("The migration plan became stale before it acquired maintenance mode"), {
                status: 409,
            });
        } else {
            await prepareMigrationParticipants(context.participants, record.siteId, state.collections);
        }
        if (record.collectionRevisionAfterCommit !== record.expectedCollectionRevision + 1) {
            record = await context.journal.replace(record, {
                collectionRevisionAfterCommit: record.expectedCollectionRevision + 1,
            });
        }
        record = await context.journal.transition(record, "migrating");
        await migratePages(context, record);
        record = await context.journal.transition(record, "validating");
        await assertPagesApplied(context, record);
        await applySystemMigration(context, record);
        return context.journal.transition(record, "completed");
    } catch (error) {
        if (await cancelUnstarted(context, record, error)) {
            throw error;
        }
        await context.journal.fail(record, error);
        throw error;
    }
}

async function applySystemMigration(context: ExecutionContext, record: CollectionMigrationRecord): Promise<void> {
    await context.journal.assertOwnership(record);
    const current = await context.repository.getSystem();
    if (isDeepStrictEqual(current.theme, record.systemAfter.theme)) {
        return;
    }
    if (!isDeepStrictEqual(current.theme, record.systemAfterCollectionCommit.theme)) {
        throw new Error("System settings changed during migration");
    }
    await context.journal.assertOwnership(record);
    await context.repository.updateSystem({ theme: record.systemAfter.theme });
}

async function migratePages(context: ExecutionContext, record: CollectionMigrationRecord): Promise<void> {
    for await (const pages of migrationPageBatches(context.journal, record)) {
        await context.journal.assertOwnership(record);
        await forEachMigrationPage(pages, async (change) => {
            const current = await context.repository.getPageById(change.before.id);
            if (!current) {
                throw new Error(`Page disappeared during migration: ${change.before.id}`);
            }
            if (change.state === "applied") {
                if (current.revision !== change.appliedRevision || current.content !== change.afterContent) {
                    throw new Error(`Migrated page changed unexpectedly: ${change.before.id}`);
                }
                return;
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
        });
    }
}

async function assertPagesApplied(context: ExecutionContext, record: CollectionMigrationRecord): Promise<void> {
    for await (const pages of migrationPageBatches(context.journal, record)) {
        await context.journal.assertOwnership(record);
        await forEachMigrationPage(pages, async (change) => {
            const page = await context.repository.getPageById(change.before.id);
            if (!page || page.revision !== change.appliedRevision || page.content !== change.afterContent) {
                throw new Error(`Migrated page failed validation: ${change.before.id}`);
            }
        });
    }
}

async function assertSnapshotCurrent(context: ExecutionContext, record: CollectionMigrationRecord): Promise<void> {
    const [state, pageRevisionDigest, system, blocRecords, referenceSnapshots] = await Promise.all([
        context.collections.snapshot(record.siteId),
        collectionPageRevisionDigestFromRepository(context.repository),
        context.repository.getSystem(),
        context.repository.getBlocRecords(),
        snapshotMigrationParticipants(record.siteId, context.participants),
    ]);
    if (
        state.revision !== record.expectedCollectionRevision ||
        !installationsMatch(state.collections, record.installationsBefore) ||
        pageRevisionDigest !== record.pageRevisionDigest ||
        collectionSiteResourceDigest(blocRecords, referenceSnapshots) !== record.siteResourceDigest ||
        !isDeepStrictEqual(system, record.systemBefore)
    ) {
        throw Object.assign(new Error("Site content changed while the migration plan was being acquired; retry"), {
            status: 409,
        });
    }
    await context.journal.assertOwnership(record);
}

async function cancelUnstarted(
    context: ExecutionContext,
    record: CollectionMigrationRecord,
    error: unknown,
): Promise<boolean> {
    const current = (await context.journal.current(record.id)) ?? record;
    const progress = await context.journal.getProgress(current.siteId, current.id);
    if (!progress || progress.appliedPages > 0 || progress.rolledBackPages > 0) {
        return false;
    }
    if (current.status === "planning") {
        await context.journal.replace(current, {
            status: "rolled-back",
            error: error instanceof Error ? error.message : "Migration plan became stale",
        });
        return true;
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
