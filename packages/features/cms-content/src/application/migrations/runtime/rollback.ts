import type { CollectionStore } from "@bernouy/cms-repository/collections/installations";
import { isDeepStrictEqual } from "node:util";
import type { CmsRepository } from "cms-content/application/interfaces/CmsRepository";
import type { CollectionMigrationRecord } from "../interfaces";
import { forEachMigrationPage } from "./concurrency";
import { installationsMatch, pagePatch } from "./helpers";
import type { MigrationJournal } from "./journal";
import { assertRollbackSafe } from "./rollbackValidation";

type RollbackContext = {
    repository: CmsRepository;
    collections: CollectionStore;
    journal: MigrationJournal;
};

export async function rollbackCollectionMigration(
    context: RollbackContext,
    record: CollectionMigrationRecord,
): Promise<CollectionMigrationRecord> {
    const previousStatus = record.status;
    const claimed = record.status !== "rolling-back";
    if (claimed) {
        record = await context.journal.transition(record, "rolling-back");
    }
    try {
        await assertRollbackSafe(context, record);
    } catch (error) {
        if (claimed) {
            await context.journal.transition(record, previousStatus);
        }
        throw error;
    }
    if (!record.rollbackStartedAt) {
        record = await context.journal.replace(record, { rollbackStartedAt: new Date().toISOString() });
    }
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
    await forEachMigrationPage([...record.pages].reverse(), async (change) => {
        const current = await context.repository.getPageById(change.before.id);
        if (!current) {
            throw new Error(`Page disappeared during rollback: ${change.before.id}`);
        }
        if (change.state === "rolled-back") {
            if (current.revision !== change.rolledBackRevision || current.content !== change.before.content) {
                throw new Error(`Rolled-back page changed unexpectedly: ${change.before.id}`);
            }
            return;
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
    });
}
