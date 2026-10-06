import { resolveCollectionTranslation } from "@bernouy/cms-repository/collections";
import type { CmsCollectionDependencies } from "../../ports";

export function projectMigrationPlan(
    plan: Awaited<ReturnType<CmsCollectionDependencies["collectionMigrations"]["plan"]>>,
) {
    return {
        expectedRevision: plan.expectedCollectionRevision,
        planDigest: plan.planDigest,
        targets: plan.targets,
        totalPages: plan.totalPages,
        operationCount: plan.operationCount,
        blockedReasons: plan.blockedReasons,
    };
}

export function projectMigrationResult(
    record: Awaited<ReturnType<CmsCollectionDependencies["collectionMigrations"]["execute"]>>,
) {
    return {
        migrationId: record.id,
        status: record.status,
        collectionRevision: record.collectionRevisionAfterCommit ?? record.expectedCollectionRevision,
        totalPages: record.pageCount,
        operationCount: record.operationGroups.reduce((total, group) => total + group.operations.length, 0),
    };
}

export function projectSnapshot(snapshot: Awaited<ReturnType<CmsCollectionDependencies["collections"]["snapshot"]>>) {
    return {
        revision: snapshot.revision,
        items: snapshot.collections.map((collection) => projectInstalled(collection, snapshot.revision, false)),
    };
}

export function projectInstalled(
    collection: Awaited<ReturnType<CmsCollectionDependencies["collections"]["snapshot"]>>["collections"][number],
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
        configurable: release.configuration !== undefined,
        ...(detailed
            ? {
                  name: resolveCollectionTranslation(release, release.name, release.locale),
                  description: release.description
                      ? resolveCollectionTranslation(release, release.description, release.locale)
                      : "",
                  revision,
                  configurationJson: JSON.stringify(installation.configuration),
                  overriddenLocaleCount: Object.keys(installation.textOverrides).length,
                  blocs: release.blocs.map((bloc) => ({
                      id: bloc.id,
                      label: resolveCollectionTranslation(release, bloc.label, release.locale),
                      description: bloc.description
                          ? resolveCollectionTranslation(release, bloc.description, release.locale)
                          : "",
                      generation: bloc.generation ?? 1,
                      internal: bloc.internal ?? false,
                      surfaces: bloc.surfaces ?? ["control", "delivery"],
                  })),
              }
            : {}),
    };
}
