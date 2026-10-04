import type { CollectionStore } from "@bernouy/cms-repository/collections/installations";
import { isDeepStrictEqual } from "node:util";
import type { CmsRepository } from "cms-content/application/interfaces/CmsRepository";
import type { CollectionMigrationRecord } from "../interfaces";
import type { CollectionMigrationParticipant } from "../interfaces";
import { forEachMigrationPage } from "./concurrency";
import { migrationTargetInstallationsMatch, migrationTargetSnapshot, prepareMigrationParticipants } from "./helpers";
import type { MigrationJournal } from "./journal";
import { assertRollbackSafe } from "./rollbackValidation";
import { migrationThemeTokenIds, restoreThemeTokenValues } from "./theme";

type RollbackContext = {
    repository: CmsRepository;
    collections: CollectionStore;
    journal: MigrationJournal;
    participants: readonly CollectionMigrationParticipant[];
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
        await prepareMigrationParticipants(
            context.participants,
            record.siteId,
            await migrationTargetSnapshot(context.collections, record, "before"),
        );
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
        await context.journal.assertOwnership(record);
        const system = await context.repository.getSystem();
        const restoredTheme = restoreThemeTokenValues(
            system.theme,
            record.systemBefore.theme,
            migrationThemeTokenIds(record),
        );
        if (!isDeepStrictEqual(system.theme, restoredTheme)) {
            await context.journal.assertOwnership(record);
            await context.repository.updateSystem({ theme: restoredTheme });
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
    await context.journal.assertOwnership(record);
    const state = await context.collections.snapshot(record.siteId);
    if (!migrationTargetInstallationsMatch(state.collections, record, "before")) {
        await context.journal.assertOwnership(record);
        const restored = await context.collections.restoreMigration(
            record.siteId,
            record.installationsBefore,
            record.replacements,
            state.revision,
        );
        return context.journal.replace(record, { collectionRevisionAfterRollback: restored.revision });
    }
    if (migrationTargetInstallationsMatch(state.collections, record, "before")) {
        return context.journal.replace(record, { collectionRevisionAfterRollback: state.revision });
    }
    return record;
}

async function restorePages(context: RollbackContext, record: CollectionMigrationRecord): Promise<void> {
    await forEachMigrationPage([...record.pages].reverse(), async (change) => {
        await context.journal.assertOwnership(record);
        const current = await context.repository.getPageById(change.before.id);
        if (!current) {
            if (change.state !== "rolled-back") {
                await context.journal.persistPage(record, change, {
                    ...change,
                    state: "rolled-back",
                    deletedAfterMigration: true,
                });
            } else if (!change.deletedAfterMigration) {
                throw new Error(`Page disappeared during rollback: ${change.before.id}`);
            }
            return;
        }
        if (change.state === "rolled-back") {
            if (change.deletedAfterMigration || current.content !== change.before.content) {
                throw new Error(`Rolled-back page changed unexpectedly: ${change.before.id}`);
            }
            return;
        }
        let rolledBackRevision: number;
        if (current.content === change.before.content) {
            rolledBackRevision = current.revision;
        } else if (current.content === change.afterContent) {
            const restored = await context.repository.updatePage(
                { id: change.before.id, content: change.before.content },
                current.revision,
            );
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
            appliedRevision: change.appliedRevision,
            rolledBackRevision,
        });
    });
}
