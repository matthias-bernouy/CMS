import type {
    CollectionInstallation,
    CollectionStore,
    InstalledCollection,
} from "@bernouy/cms-repository/collections/installations";
import { isDeepStrictEqual } from "node:util";
import type {
    CollectionMigrationParticipant,
    CollectionMigrationPageChange,
    CollectionMigrationRecord,
    CollectionMigrationSummary,
} from "../interfaces";
import type { prepareCollectionMigration } from "../plan";

export function pagePatch(page: CollectionMigrationPageChange["before"]) {
    const { revision: _revision, ...patch } = page;
    return patch;
}

export function migrationTargetsMatch(
    collections: readonly InstalledCollection[],
    record: CollectionMigrationRecord,
): boolean {
    const replacements = new Map(record.replacements.map((replacement) => [replacement.collectionId, replacement]));
    const expected = record.installationsBefore.map(
        (installation) => replacements.get(installation.collectionId) ?? installation,
    );
    return installationsMatch(collections, expected);
}

export function migrationTargetInstallationsMatch(
    collections: readonly InstalledCollection[],
    record: CollectionMigrationRecord,
    side: "before" | "after",
): boolean {
    const current = new Map(
        collections.map(({ release: _release, ...installation }) => [installation.collectionId, installation]),
    );
    const replacements = new Map(record.replacements.map((replacement) => [replacement.collectionId, replacement]));
    return record.replacements.every((replacement) => {
        const expected =
            side === "after"
                ? replacement
                : record.installationsBefore.find(({ collectionId }) => collectionId === replacement.collectionId);
        return !!expected && isDeepStrictEqual(current.get(replacement.collectionId), expected);
    });
}

export function installationsMatch(
    collections: readonly InstalledCollection[],
    installations: readonly CollectionInstallation[],
): boolean {
    return isDeepStrictEqual(
        collections.map(({ release: _release, ...installation }) => installation),
        installations,
    );
}

export async function migrationTargetSnapshot(
    collections: CollectionStore,
    record: CollectionMigrationRecord,
    side: "before" | "after",
): Promise<InstalledCollection[]> {
    const replacements = new Map(record.replacements.map((replacement) => [replacement.collectionId, replacement]));
    const installations = record.installationsBefore.map((installation) =>
        side === "after" ? (replacements.get(installation.collectionId) ?? installation) : installation,
    );
    return Promise.all(
        installations.map(async (installation) => {
            const artifact = await collections.getRelease(installation.digest);
            if (!artifact || artifact.release.collectionId !== installation.collectionId) {
                throw new Error(`Collection release is unavailable for ${installation.collectionId}`);
            }
            return { ...structuredClone(installation), release: artifact.release };
        }),
    );
}

export async function prepareMigrationParticipants(
    participants: readonly CollectionMigrationParticipant[],
    siteId: string,
    collections: readonly InstalledCollection[],
): Promise<void> {
    for (const participant of participants) {
        await participant.prepareTarget?.({ siteId, collections });
    }
}

export function summarizeMigration(
    plan: Awaited<ReturnType<typeof prepareCollectionMigration>>,
): CollectionMigrationSummary {
    return {
        siteId: plan.siteId,
        expectedCollectionRevision: plan.expectedCollectionRevision,
        planDigest: plan.planDigest,
        targets: plan.replacements.map((target) => ({
            collectionId: target.collectionId,
            fromDigest: plan.installationsBefore.find((item) => item.collectionId === target.collectionId)!.digest,
            toDigest: target.digest,
        })),
        resources: plan.resources,
        pages: plan.pages.map(({ before, operations }) => ({
            id: before.id,
            path: before.path,
            revision: before.revision,
            operations,
        })),
        totalPages: plan.pageCount,
        operationCount: plan.operationGroups.reduce((count, group) => count + group.operations.length, 0),
        blockedReasons: plan.blockedReasons,
    };
}
