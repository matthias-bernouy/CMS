import { isVersionRangeSubset, versionBump } from "cms-repository/exports/contracts/compatibility";
import { canonicalizeIJson } from "cms-repository/exports/contracts/protocol";
import { collectionUpgradeBreakingResources } from "../../installations/core/upgradeCompatibility";
import type {
    CollectionCapabilityRequirement,
    CollectionRelease,
    CollectionResourceSelection,
} from "../../interfaces/CollectionRelease";
import { describeCollectionResources } from "./resourceDescriptors";

/** Enforce collection SemVer, per-resource generations and persisted-data generations at publication time. */
export async function verifyCollectionPublicationEvolution(
    previous: CollectionRelease,
    next: CollectionRelease,
): Promise<void> {
    if (previous.publisherId !== next.publisherId || previous.collectionId !== next.collectionId) {
        throw new TypeError("Collection publication lineage cannot change identity or publisher");
    }
    const bump = versionBump(previous.version, next.version);
    if (!bump) {
        throw new TypeError("Collection publication version must increase");
    }
    if (next.dataGeneration < previous.dataGeneration || next.dataGeneration > previous.dataGeneration + 1) {
        throw new TypeError("Collection data generation must stay unchanged or advance by one adjacent step");
    }
    const [before, after] = await Promise.all([
        describeCollectionResources(previous),
        describeCollectionResources(next),
    ]);
    const afterByKey = new Map(after.map((resource) => [`${resource.kind}:${resource.id}`, resource]));
    for (const resource of before) {
        const replacement = afterByKey.get(`${resource.kind}:${resource.id}`);
        if (replacement && replacement.generation < resource.generation) {
            throw new TypeError(`Collection resource generation decreased for ${resource.kind} ${resource.id}`);
        }
    }
    const structuralBreaks = new Set(
        collectionUpgradeBreakingResources(previous, next).map(({ kind, id }) => `${kind}:${id}`),
    );
    requirementBreaks(previous, next).forEach((key) => structuralBreaks.add(key));
    if (dependencyContractRestricted(previous, next)) {
        structuralBreaks.add("dependency:collection-graph");
    }
    const removedExports = removedCollectionExports(previous.exports, next.exports);
    const changedGenerations = before.filter((resource) => {
        const replacement = afterByKey.get(`${resource.kind}:${resource.id}`);
        return replacement && replacement.generation !== resource.generation;
    });
    if (bump === "patch") {
        const contractChanged =
            before.length !== after.length ||
            before.some((resource) => {
                const replacement = afterByKey.get(`${resource.kind}:${resource.id}`);
                return !replacement || replacement.contractDigest !== resource.contractDigest;
            }) ||
            canonicalizeIJson(previous.dependencies ?? []) !== canonicalizeIJson(next.dependencies ?? []) ||
            canonicalizeIJson(previous.exports ?? emptyExports()) !== canonicalizeIJson(next.exports ?? emptyExports());
        if (contractChanged || next.dataGeneration !== previous.dataGeneration) {
            throw new TypeError("Patch collection publications may change implementations only");
        }
    }
    if (bump === "minor" && (structuralBreaks.size || removedExports.length || changedGenerations.length)) {
        throw new TypeError("Minor collection publications must remain compatible and keep resource generations");
    }
    if (bump !== "major" && next.dataGeneration !== previous.dataGeneration) {
        throw new TypeError("Collection data generation changes require a major publication");
    }
    if (bump === "major") {
        for (const key of structuralBreaks) {
            const oldResource = before.find((resource) => `${resource.kind}:${resource.id}` === key);
            const replacement = afterByKey.get(key);
            if (oldResource && replacement && replacement.generation <= oldResource.generation) {
                throw new TypeError(`Breaking resource ${key} must increase its generation`);
            }
        }
        if (
            (structuralBreaks.size || removedExports.length || changedGenerations.length) &&
            next.dataGeneration === previous.dataGeneration
        ) {
            throw new TypeError("Breaking collection publications require a data-generation migration");
        }
    }
}

function dependencyContractRestricted(previous: CollectionRelease, next: CollectionRelease): boolean {
    const old = new Map((previous.dependencies ?? []).map((dependency) => [dependency.collectionId, dependency]));
    return (next.dependencies ?? []).some((dependency) => {
        const prior = old.get(dependency.collectionId);
        if (!prior) {
            return false;
        }
        if (prior.publisherId !== dependency.publisherId) {
            return true;
        }
        if (!isVersionRangeSubset(prior.versionRange, dependency.versionRange)) {
            return true;
        }
        const previousImports = new Map([
            ...prior.imports.blocs.map((item) => [`bloc:${item.id}`, item.generation] as const),
            ...prior.imports.themeTokens.map((item) => [`theme-token:${item.id}`, item.generation] as const),
            ...(prior.imports.texts ?? []).map((item) => [`text:${item.id}`, item.generation] as const),
            ...(prior.imports.assets ?? []).map((item) => [`asset:${item.id}`, item.generation] as const),
        ]);
        return [
            ...dependency.imports.blocs.map((item) => [`bloc:${item.id}`, item.generation] as const),
            ...dependency.imports.themeTokens.map((item) => [`theme-token:${item.id}`, item.generation] as const),
            ...(dependency.imports.texts ?? []).map((item) => [`text:${item.id}`, item.generation] as const),
            ...(dependency.imports.assets ?? []).map((item) => [`asset:${item.id}`, item.generation] as const),
        ].some(([key, generation]) => {
            const oldGeneration = previousImports.get(key);
            return oldGeneration !== undefined && oldGeneration !== generation;
        });
    });
}

function requirementBreaks(previous: CollectionRelease, next: CollectionRelease): string[] {
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
            if (!bloc.internal && replacement.internal) {
                breaks.push(`bloc:${bloc.id}`);
            }
        }
    }
    const nextViews = new Map((next.views ?? []).map((view) => [view.id, view]));
    for (const view of previous.views ?? []) {
        const replacement = nextViews.get(view.id);
        if (replacement) {
            compare(`view:${view.id}`, view.requires, replacement.requires);
        }
    }
    return breaks;
}

function removedCollectionExports(
    previous: CollectionResourceSelection | undefined,
    next: CollectionResourceSelection | undefined,
): string[] {
    const removed: string[] = [];
    for (const key of ["blocs", "themeTokens", "texts", "assets"] as const) {
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
