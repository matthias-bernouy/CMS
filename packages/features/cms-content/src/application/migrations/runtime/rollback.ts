import type { CollectionStore } from "@bernouy/cms-repository/collections/installations";
import { isDeepStrictEqual } from "node:util";
import type { CmsRepository } from "cms-content/application/interfaces/CmsRepository";
import type { CollectionMigrationRecord } from "../interfaces";
import { installationsMatch, migrationTargetsMatch, pagePatch } from "./helpers";
import type { MigrationJournal } from "./journal";

type RollbackContext = {
    repository: CmsRepository;
    collections: CollectionStore;
    journal: MigrationJournal;
};

export async function rollbackCollectionMigration(
    context: RollbackContext,
    record: CollectionMigrationRecord,
): Promise<CollectionMigrationRecord> {
    await assertRollbackSafe(context, record);
    record = await context.journal.transition(record, "rolling-back", {
        rollbackStartedAt: record.rollbackStartedAt ?? new Date().toISOString(),
    });
    try {
        record = await restoreCollections(context, record);
        await restorePages(context, record);
        if (!isDeepStrictEqual(await context.repository.getSystem(), record.systemBefore)) {
            await context.repository.updateSystem(record.systemBefore);
        }
        return context.journal.transition(record, "rolled-back");
    } catch (error) {
        await context.journal.fail(record, error);
        throw error;
    }
}

async function restoreCollections(
    context: RollbackContext,
    record: CollectionMigrationRecord,
): Promise<CollectionMigrationRecord> {
    const state = await context.collections.snapshot(record.siteId);
    if (state.revision === record.expectedCollectionRevision + 1) {
        const restored = await context.collections.restoreMigration(
            record.siteId,
            record.installationsBefore,
            state.revision,
        );
        return context.journal.replace(record, { collectionRevisionAfterRollback: restored.revision });
    }
    if (
        state.revision === record.expectedCollectionRevision + 2 &&
        installationsMatch(state.collections, record.installationsBefore)
    ) {
        return context.journal.replace(record, { collectionRevisionAfterRollback: state.revision });
    }
    return record;
}

async function restorePages(context: RollbackContext, record: CollectionMigrationRecord): Promise<void> {
    for (const change of [...record.pages].reverse()) {
        const current = await context.repository.getPageById(change.before.id);
        if (!current) {
            throw new Error(`Page disappeared during rollback: ${change.before.id}`);
        }
        if (change.state === "rolled-back") {
            if (current.revision !== change.rolledBackRevision || current.content !== change.before.content) {
                throw new Error(`Rolled-back page changed unexpectedly: ${change.before.id}`);
            }
            continue;
        }
        const appliedRevision = change.appliedRevision ?? change.before.revision + 1;
        let rolledBackRevision: number;
        if (current.revision === change.before.revision && current.content === change.before.content) {
            rolledBackRevision = current.revision;
        } else if (current.revision === appliedRevision + 1 && current.content === change.before.content) {
            rolledBackRevision = current.revision;
        } else if (current.revision === appliedRevision && current.content === change.afterContent) {
            const restored = await context.repository.updatePage(pagePatch(change.before), current.revision);
            if (!restored) {
                throw new Error(`Page disappeared during rollback: ${change.before.id}`);
            }
            rolledBackRevision = restored.revision;
        } else {
            throw new Error(`Page revision changed during rollback: ${change.before.id}`);
        }
        await context.journal.persistPage(record, change, {
            ...change,
            state: "rolled-back",
            appliedRevision:
                change.appliedRevision ?? (current.content === change.afterContent ? current.revision : undefined),
            rolledBackRevision,
        });
    }
}

async function assertRollbackSafe(context: RollbackContext, record: CollectionMigrationRecord): Promise<void> {
    const [state, system] = await Promise.all([
        context.collections.snapshot(record.siteId),
        context.repository.getSystem(),
    ]);
    const restoredCollection =
        !!record.rollbackStartedAt &&
        state.revision === record.expectedCollectionRevision + 2 &&
        installationsMatch(state.collections, record.installationsBefore);
    if (
        state.revision !== record.expectedCollectionRevision &&
        (state.revision !== record.expectedCollectionRevision + 1 ||
            !migrationTargetsMatch(state.collections, record)) &&
        !restoredCollection
    ) {
        throw Object.assign(new Error("Collections changed after the migration; rollback is unsafe"), { status: 409 });
    }
    if (!isDeepStrictEqual(system, record.systemAfter) && !isDeepStrictEqual(system, record.systemBefore)) {
        throw Object.assign(new Error("System settings changed after the migration; rollback is unsafe"), {
            status: 409,
        });
    }
    for (const change of record.pages) {
        const page = await context.repository.getPageById(change.before.id);
        const untouched = page?.revision === change.before.revision && page.content === change.before.content;
        const appliedRevision = change.appliedRevision ?? change.before.revision + 1;
        const migrated = page?.revision === appliedRevision && page.content === change.afterContent;
        const restoredPage =
            !!record.rollbackStartedAt &&
            page?.revision === (change.rolledBackRevision ?? appliedRevision + 1) &&
            page.content === change.before.content;
        if (!untouched && !migrated && !restoredPage) {
            throw Object.assign(new Error(`Page changed after migration: ${change.before.path}`), { status: 409 });
        }
    }
}
