import type { SiteUpgradeActive } from "@bernouy/cms-repository/upgrades";
import { resolveCollectionTranslation } from "@bernouy/cms-repository/collections";
import type { CmsCollectionDependencies } from "../../ports";

export function projectUpgradePlan(
    plan: Awaited<ReturnType<CmsCollectionDependencies["collectionUpgrades"]["plan"]>>,
    references: unknown,
) {
    return {
        expectedRevision: plan.expectedRevision,
        planDigest: plan.planDigest,
        status: plan.status,
        issues: plan.issues.slice(0, 1024),
        issueCount: plan.issues.length,
        resources: plan.resources.slice(0, 4096),
        resourceCount: plan.resources.length,
        source: plan.source,
        usageDigest: plan.inventory.digest,
        references,
    };
}

export function projectUpgradeResult(record: SiteUpgradeActive) {
    return {
        upgradeId: record.id,
        status: record.status,
        collectionRevision: record.expectedRevision + (record.status === "completed" ? 1 : 0),
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
        blocCount: release.blocs.length,
        exampleCount: release.examples?.length ?? 0,
        assetCount: release.assets.length,
        textCount: release.texts?.length ?? 0,
        themeTokenCount:
            release.theme?.categories.reduce(
                (total, category) => total + category.entries.filter((entry) => entry.type !== "font-face").length,
                0,
            ) ?? 0,
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
                      catalogue: bloc.catalogue ?? "listed",
                  })),
              }
            : {}),
    };
}
