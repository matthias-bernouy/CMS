import type { GetSiteUpgradeStatusOutput } from "cms-repository/application/installations/interfaces/outputs";
import type { InstallationServices } from "cms-repository/application/installations/interfaces/services";
import type { ListSiteUsageInput } from "cms-repository/application/installations/interfaces/inputs";
import { InstallationError } from "cms-repository/application/installations/core/errors";
import {
    projectInstalledDetail,
    projectUpgradeResult,
} from "cms-repository/application/installations/core/collections/projection";
export async function siteUsage(
    upgrades: InstallationServices["collectionUpgrades"],
    siteId: string,
    input: ListSiteUsageInput,
) {
    const inventory = await upgrades.inventory(siteId);
    const cursor = input.cursor ?? "";
    const parts = cursor.split(":");
    const offset = cursor ? Number(parts.pop()) : 0;
    if (
        cursor &&
        (parts.join(":") !== inventory.digest ||
            !Number.isSafeInteger(offset) ||
            offset < 0 ||
            offset > inventory.references.length)
    ) {
        throw new InstallationError("REVISION_CONFLICT");
    }
    const next = offset + (input.limit ?? 100);
    return {
        complete: inventory.complete,
        digest: inventory.digest,
        unknown: inventory.unknown.slice(0, 1024),
        unknownCount: inventory.unknown.length,
        total: inventory.references.length,
        references: inventory.references.slice(offset, next),
        ...(next < inventory.references.length ? { cursor: `${inventory.digest}:${next}` } : {}),
    };
}
export async function installedCollection(
    collections: InstallationServices["collections"],
    siteId: string,
    collectionId: string,
) {
    const installed = await collections.readInstalled(siteId, collectionId);
    if (!installed) {
        throw new InstallationError("NOT_FOUND");
    }
    return projectInstalledDetail(installed.collection, installed.revision);
}
export async function availableCollections(
    services: InstallationServices,
    siteId: string,
    channel: "stable" | "beta" | "all" = "stable",
) {
    return services.sources
        ? services.sources.catalogue(siteId, channel)
        : { revision: await services.collections.revision(siteId), repositories: [], releases: [], installed: [] };
}
export async function siteUpgradeStatus(
    upgrades: InstallationServices["collectionUpgrades"],
    siteId: string,
): Promise<GetSiteUpgradeStatusOutput> {
    const active = await upgrades.storage.getActive(siteId);
    return {
        maintenance: active !== null,
        ...(active
            ? {
                  activeUpgrade: {
                      id: active.id,
                      kind: upgradeKind(active.kind),
                      status: active.status,
                      createdAt: active.createdAt,
                  },
              }
            : {}),
    };
}
export async function collectionUpgrade(
    upgrades: InstallationServices["collectionUpgrades"],
    siteId: string,
    upgradeId: string,
) {
    const intent = await upgrades.storage.get(siteId, upgradeId, "collection");
    if (!intent) {
        throw new InstallationError("NOT_FOUND");
    }
    return projectUpgradeResult(intent);
}

function upgradeKind(kind: string): "collection" | "contracts" {
    if (kind !== "collection" && kind !== "contracts") {
        throw new InstallationError("CORE_UNAVAILABLE");
    }
    return kind;
}
