import type { SiteUpgradeActive } from "cms-repository/exports/upgrades/index";
import { resolveCollectionTranslation } from "cms-repository/exports/collections/index";
import type { InstallationServices } from "cms-repository/application/installations/interfaces/services";
import type { PlanCollectionUpgradeInput } from "cms-repository/application/installations/interfaces/inputs";

export function projectUpgradePlan(
    plan: Awaited<ReturnType<InstallationServices["collectionUpgrades"]["plan"]>>,
    references: PlanCollectionUpgradeInput["targets"],
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

export function projectSnapshot(snapshot: Awaited<ReturnType<InstallationServices["collections"]["installMany"]>>) {
    return {
        revision: snapshot.revision,
        items: snapshot.collections.map((collection) => projectInstalled(collection)),
    };
}

type Installed = Awaited<ReturnType<InstallationServices["collections"]["installMany"]>>["collections"][number];
function projectInstalled(collection: Installed) {
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
    };
}
export function projectInstalledDetail(collection: Installed, revision: number) {
    const { release, ...installation } = collection;
    return {
        ...projectInstalled(collection),
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
    };
}
