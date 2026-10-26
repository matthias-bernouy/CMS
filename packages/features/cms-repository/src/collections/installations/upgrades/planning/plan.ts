import type { ContentRepository } from "@bernouy/cms-content";
import type { CollectionStore } from "../../core/CollectionStore";
import { compareSemVer } from "cms-repository/exports/contracts/compatibility";
import { assertCollectionResourceIsolation } from "../../core/resourceIsolation";
import { validateStoredCollectionInstallation } from "../../core/siteState";
import type { CollectionInstallation } from "../../interfaces/store";
import type { CollectionUpgradePlan, CollectionUpgradeTarget, UpgradeIssue } from "../interfaces";
import type { UsageContributor, CapabilityUse, BindingUse } from "../usage/interfaces";
import { inventoryFromSnapshot } from "../usage/inventory";
import { readUsageSnapshot, usageDigest } from "../usage/snapshot";
import { verifyCollectionPublicationEvolution } from "../../../core/admission/evolution";
import { resourceChanges, validateResourceUses } from "./resources";
import { validateUpgradeContent } from "./content";

export type CollectionUpgradeAnalysis = Readonly<{
    contributors: readonly UsageContributor[];
    requiredConsumers: readonly string[];
    validateCapabilities(references: readonly (CapabilityUse | BindingUse)[]): Promise<readonly UpgradeIssue[]>;
}>;

/** Preparation reads state only. The returned digest pins every analysed revision and explicit value. */
export async function prepareCollectionUpgrade(
    repository: ContentRepository,
    collections: CollectionStore,
    siteId: string,
    targets: readonly CollectionUpgradeTarget[],
    analysis: CollectionUpgradeAnalysis,
    getRelease: CollectionStore["getRelease"] = (digest) => collections.getRelease(digest),
): Promise<CollectionUpgradePlan> {
    if (!targets.length || targets.length > 256) {
        throw new TypeError("An upgrade needs between 1 and 256 targets");
    }
    const snapshot = await readUsageSnapshot(repository, collections, siteId, analysis.contributors);
    const artifacts = await Promise.all(
        targets.map(async (target) => {
            const artifact = await getRelease(target.digest);
            if (!artifact) {
                throw Object.assign(new Error(`Unknown collection release ${target.digest}`), { status: 404 });
            }
            return { target, artifact };
        }),
    );
    const byId = new Map(artifacts.map((entry) => [entry.artifact.release.collectionId, entry]));
    if (byId.size !== targets.length) {
        throw new TypeError("Upgrade targets must name unique collections");
    }
    const issues: UpgradeIssue[] = [];
    const replacements: CollectionInstallation[] = [];
    for (const { artifact, target } of artifacts) {
        const previous = snapshot.installed.collections.find(
            ({ collectionId }) => collectionId === artifact.release.collectionId,
        );
        if (!previous) {
            throw Object.assign(new Error(`Collection is not installed: ${artifact.release.collectionId}`), {
                status: 404,
            });
        }
        if (
            previous.release.publisherId !== artifact.release.publisherId ||
            compareSemVer(artifact.release.version, previous.release.version) <= 0
        ) {
            issues.push({
                code: "invalid-dependency",
                location: `collection:${previous.collectionId}`,
                message: "Upgrade requires a newer release from the same publisher",
            });
        }
        try {
            await verifyCollectionPublicationEvolution(previous.release, artifact.release);
        } catch (error) {
            issues.push({
                code: "invalid-dependency",
                location: `collection:${previous.collectionId}`,
                message: error instanceof Error ? error.message : "Invalid collection evolution",
            });
        }
        const replacement = {
            collectionId: previous.collectionId,
            digest: artifact.digest,
            ...((target.repositoryId ?? previous.repositoryId)
                ? { repositoryId: target.repositoryId ?? previous.repositoryId }
                : {}),
            configuration:
                target.configuration ??
                (previous.release.configuration
                    ? previous.configuration
                    : (artifact.release.configuration?.defaults ?? {})),
            textOverrides: target.textOverrides ?? previous.textOverrides,
        };
        try {
            validateStoredCollectionInstallation(replacement, artifact.release);
        } catch (error) {
            issues.push({
                code: "invalid-configuration",
                location: `collection:${previous.collectionId}/configuration`,
                message: error instanceof Error ? error.message : "Invalid target configuration",
            });
        }
        replacements.push(replacement);
    }
    const finalCollections = snapshot.installed.collections.map((installed) => {
        const target = byId.get(installed.collectionId);
        return target
            ? {
                  ...replacements.find(({ collectionId }) => collectionId === installed.collectionId)!,
                  release: target.artifact.release,
              }
            : installed;
    });
    const previous = snapshot.installed.collections.map(({ release }) => release);
    const releases = finalCollections.map(({ release }) => release);
    try {
        assertCollectionResourceIsolation(releases);
    } catch (error) {
        issues.push({
            code: "invalid-dependency",
            location: "collections",
            message: error instanceof Error ? error.message : "Invalid target collection graph",
        });
    }
    const resources = resourceChanges(previous, releases);
    const inventory = inventoryFromSnapshot(
        siteId,
        { ...snapshot, installed: { ...snapshot.installed, collections: finalCollections } },
        analysis.requiredConsumers,
        previous,
    );
    issues.push(...inventory.unknown.map((message) => ({ code: "incomplete" as const, location: "usage", message })));
    issues.push(...validateResourceUses(inventory, releases, resources));
    issues.push(...(await validateUpgradeContent(repository, snapshot, releases)));
    issues.push(
        ...(await analysis.validateCapabilities(
            inventory.references.filter(
                (ref): ref is CapabilityUse | BindingUse => ref.type !== "resource" && ref.scope === "runtime",
            ),
        )),
    );
    const after = await readUsageSnapshot(repository, collections, siteId, analysis.contributors);
    if (after.digest !== snapshot.digest) {
        issues.push({ code: "incomplete", location: "site", message: "Site changed while preparing the upgrade" });
    }
    const result = {
        siteId,
        status: issues.some(({ code }) => code === "incomplete")
            ? ("incomplete" as const)
            : issues.length
              ? ("blocked" as const)
              : ("applicable" as const),
        expectedRevision: snapshot.installed.revision,
        source: snapshot.installed.collections.map(({ release, digest }) => ({
            collectionId: release.collectionId,
            version: release.version,
            digest,
        })),
        targets: structuredClone(targets),
        replacements,
        resources,
        issues,
        inventory,
        revisions: snapshot.revisions,
    };
    return { ...result, planDigest: usageDigest(result) };
}
