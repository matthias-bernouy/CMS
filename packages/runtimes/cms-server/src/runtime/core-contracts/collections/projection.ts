import type { CoreStores } from "../../stores/core";

export function projectMigrationPlan(plan: Awaited<ReturnType<CoreStores["collectionMigrations"]["plan"]>>) {
    return {
        expectedRevision: plan.expectedCollectionRevision,
        planDigest: plan.planDigest,
        targets: plan.targets,
        totalPages: plan.totalPages,
        operationCount: plan.operationCount,
        blockedReasons: plan.blockedReasons,
    };
}

export function projectMigrationResult(record: Awaited<ReturnType<CoreStores["collectionMigrations"]["execute"]>>) {
    return {
        migrationId: record.id,
        status: record.status,
        collectionRevision: record.collectionRevisionAfterCommit ?? record.expectedCollectionRevision,
        totalPages: record.pageCount,
        operationCount: record.operationGroups.reduce((total, group) => total + group.operations.length, 0),
    };
}

export function projectSnapshot(snapshot: Awaited<ReturnType<CoreStores["collections"]["snapshot"]>>) {
    return {
        revision: snapshot.revision,
        items: snapshot.collections.map((collection) => projectInstalled(collection, snapshot.revision, false)),
    };
}

export function projectInstalled(
    collection: Awaited<ReturnType<CoreStores["collections"]["snapshot"]>>["collections"][number],
    revision: number,
    detailed: boolean,
) {
    const { release, ...installation } = collection;
    return {
        collectionId: installation.collectionId,
        publisherId: release.publisherId,
        version: release.version,
        digest: installation.digest,
        ...(installation.repositoryId ? { repositoryId: installation.repositoryId } : {}),
        dataGeneration: release.dataGeneration ?? 1,
        blocCount: release.blocs.length,
        pageCount: release.pages?.length ?? 0,
        assetCount: release.assets.length,
        textCount: release.texts?.length ?? 0,
        themeTokenCount: release.theme?.categories.reduce((total, category) => total + category.tokens.length, 0) ?? 0,
        ...(detailed
            ? {
                  revision,
                  configurationJson: JSON.stringify(installation.configuration),
                  overriddenLocaleCount: Object.keys(installation.textOverrides).length,
              }
            : {}),
    };
}
