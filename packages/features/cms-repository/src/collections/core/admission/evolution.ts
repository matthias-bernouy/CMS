import { CollectionPublicationError } from "../errors";
import { resourceRuntimeNamespace } from "cms-repository/exports/contracts/protocol";
import {
    isVersionRangeSubset,
    versionBump,
    isSemVerPrerelease,
    semVerReleaseTarget,
} from "cms-repository/exports/contracts/compatibility";
import { canonicalizeIJson } from "cms-repository/exports/contracts/protocol";
import { collectionUpgradeBreakingResources } from "../../installations/core/upgradeCompatibility";
import type {
    CollectionCapabilityRequirement,
    CollectionRelease,
    CollectionResourceSelection,
} from "../../interfaces/CollectionRelease";
import { describeCollectionResources } from "./resourceDescriptors";

/** Same-identity resources retain compatible contracts across every release, including majors. */
export async function verifyCollectionPublicationEvolution(
    previous: CollectionRelease,
    next: CollectionRelease,
): Promise<void> {
    if (previous.publisherId !== next.publisherId || previous.collectionId !== next.collectionId) {
        throw new CollectionPublicationError("identity_changed");
    }
    const bump = versionBump(previous.version, next.version);
    if (!bump) {
        throw new CollectionPublicationError("version_order");
    }
    const previewEvolution =
        isSemVerPrerelease(previous.version) &&
        semVerReleaseTarget(previous.version) === semVerReleaseTarget(next.version);
    if (previewEvolution) {
        return;
    }
    const [before, after] = await Promise.all([
        describeCollectionResources(previous),
        describeCollectionResources(next),
    ]);
    const afterByKey = new Map(after.map((resource) => [`${resource.kind}:${resource.id}`, resource]));
    const breaking = collectionUpgradeBreakingResources(previous, next);
    for (const resource of breaking) {
        const id =
            resource.kind === "theme-token"
                ? `${resourceRuntimeNamespace(next.collectionId)}--${resource.id}`
                : resource.id;
        if (resource.kind !== "configuration" && afterByKey.has(`${resource.kind}:${id}`)) {
            throw new CollectionPublicationError(
                "stable_resource",
                `Incompatible ${resource.kind} ${resource.id} requires a new resource identity`,
                resource,
            );
        }
    }
    if (collectionRequirementBreaks(previous, next).length) {
        throw new CollectionPublicationError(
            "stable_resource",
            "Incompatible resource requirements require a new resource identity",
        );
    }
    const removedExports = removedCollectionExports(previous.exports, next.exports);
    const restrictedDependencies = (next.dependencies ?? []).some((dependency) => {
        const prior = previous.dependencies?.find((candidate) => candidate.collectionId === dependency.collectionId);
        return (
            prior &&
            (prior.publisherId !== dependency.publisherId ||
                !isVersionRangeSubset(prior.versionRange, dependency.versionRange))
        );
    });
    if (bump !== "major" && (breaking.length || removedExports.length || restrictedDependencies)) {
        throw new CollectionPublicationError("major_required");
    }
    if (bump === "patch") {
        if (canonicalizeIJson(previous.bootstraps ?? []) !== canonicalizeIJson(next.bootstraps ?? [])) {
            throw new CollectionPublicationError(
                "minor_required",
                "Bootstrap recipe changes require a minor publication",
            );
        }
        const changed =
            before.length !== after.length ||
            before.some(
                (resource) =>
                    resource.contractDigest !== afterByKey.get(`${resource.kind}:${resource.id}`)?.contractDigest,
            ) ||
            canonicalizeIJson(previous.dependencies ?? []) !== canonicalizeIJson(next.dependencies ?? []) ||
            canonicalizeIJson(previous.exports ?? emptyExports()) !== canonicalizeIJson(next.exports ?? emptyExports());
        if (changed) {
            const resource = after.find(
                (item) =>
                    item.contractDigest !==
                    before.find((prior) => prior.kind === item.kind && prior.id === item.id)?.contractDigest,
            );
            throw new CollectionPublicationError("minor_required", undefined, resource);
        }
    }
}

export function collectionRequirementBreaks(previous: CollectionRelease, next: CollectionRelease): string[] {
    const breaks: string[] = [];
    const compare = (
        key: string,
        before: readonly CollectionCapabilityRequirement[],
        after: readonly CollectionCapabilityRequirement[],
    ) => {
        const old = new Map(before.map((item) => [`${item.contractId}\0${item.capabilityId}`, item]));
        if (
            after.some((item) => {
                const prior = old.get(`${item.contractId}\0${item.capabilityId}`);
                return !prior || !isVersionRangeSubset(prior.versionRange, item.versionRange);
            })
        ) {
            breaks.push(key);
        }
    };
    const nextBlocs = new Map(next.blocs.map((bloc) => [bloc.id, bloc]));
    for (const bloc of previous.blocs) {
        const replacement = nextBlocs.get(bloc.id);
        if (replacement) {
            compare(`bloc:${bloc.id}`, bloc.requires, replacement.requires);
            if (bloc.catalogue !== "hidden" && replacement.catalogue === "hidden") {
                breaks.push(`bloc:${bloc.id}`);
            }
        }
    }
    return breaks;
}

function removedCollectionExports(
    previous: CollectionResourceSelection | undefined,
    next: CollectionResourceSelection | undefined,
): string[] {
    const removed: string[] = [];
    for (const key of ["blocs", "themeTokens", "texts", "assets", "states"] as const) {
        const available = new Set(next?.[key] ?? []);
        for (const id of previous?.[key] ?? []) {
            if (!available.has(id)) {
                removed.push(`${key}:${id}`);
            }
        }
    }
    return removed;
}

function emptyExports(): CollectionResourceSelection {
    return { blocs: [], themeTokens: [] };
}
