import {
    integrationVersionSatisfies,
    isIntegrationDefinitionVersionInstallable,
    type IntegrationDefinitionVersion,
} from "@bernouy/cms-integrations";
import { compare, rcompare } from "semver";
import type { LocalIntegrationRepository } from "../repository/local";
import type { LocalPackageRecord } from "../repository/manifest";
import type { LocalReleasePackage } from "./types";

export async function loadLocalReleasePackages(
    records: readonly LocalPackageRecord[],
    repository: LocalIntegrationRepository,
): Promise<readonly LocalReleasePackage[]> {
    return await Promise.all(
        records.map(async (record) => ({
            package: await repository.getPackage(record),
            definition: await repository.getDefinition(record),
        })),
    );
}

export async function ensureLocalBaselines(
    kind: string,
    candidateVersion: string,
    local: LocalIntegrationRepository,
    publishedVersions: readonly IntegrationDefinitionVersion[],
): Promise<readonly LocalPackageRecord[]> {
    const versions = publishedVersions
        .filter(isIntegrationDefinitionVersionInstallable)
        .map((entry) => entry.version)
        .filter((version) => compare(version, candidateVersion) < 0);
    const eligibleVersions = new Set(versions);
    return eligibleOlderRecords(await local.list(), kind, candidateVersion, eligibleVersions);
}

export async function resolveRequiredPackages(
    roots: readonly LocalReleasePackage[],
    local: LocalIntegrationRepository,
): Promise<readonly LocalReleasePackage[]> {
    const resolved = new Map<string, LocalReleasePackage>();
    const visiting = new Set<string>();
    const visit = async (owner: LocalReleasePackage): Promise<void> => {
        for (const dependency of requiredDependencies(owner.definition).sort((left, right) =>
            left.kind.localeCompare(right.kind),
        )) {
            const selected = await resolveDependency(dependency.kind, dependency.versionRange, local);
            const key = coordinate(selected.package.envelope.kind, selected.package.envelope.version);
            if (resolved.has(key)) {
                continue;
            }
            if (visiting.has(key)) {
                throw new Error(`Required integration dependency cycle includes ${key}`);
            }
            visiting.add(key);
            await visit(selected);
            visiting.delete(key);
            resolved.set(key, selected);
        }
    };
    for (const root of roots) {
        await visit(root);
    }
    return [...resolved.values()];
}

async function resolveDependency(
    kind: string,
    versionRange: string | undefined,
    local: LocalIntegrationRepository,
): Promise<LocalReleasePackage> {
    const select = (records: readonly LocalPackageRecord[]) =>
        records
            .filter(
                (record) =>
                    record.kind === kind &&
                    record.admission?.status !== "rejected" &&
                    (!versionRange || integrationVersionSatisfies(record.version, versionRange)),
            )
            .sort((left, right) => rcompare(left.version, right.version))[0];
    const record = select(await local.list());
    if (!record) {
        throw new Error(
            `Required dependency ${kind}${versionRange ? `@${versionRange}` : ""} is unavailable locally; release or pull it first`,
        );
    }
    return { package: await local.getPackage(record), definition: await local.getDefinition(record) };
}

function requiredDependencies(definition: LocalReleasePackage["definition"]): Array<{
    kind: string;
    versionRange?: string;
}> {
    const declared = (definition.dependencies ?? []).filter((entry) => !entry.optional);
    if (definition.schema !== "cms.integration.definition.v2" || definition.type !== "collection") {
        return declared;
    }
    const sources = new Map<string, string>();
    const collections = new Map<string, string>();
    for (const endpoint of definition.resources.flatMap((resource) => resource.endpoints ?? [])) {
        const existing = sources.get(endpoint.source);
        if (existing && existing !== endpoint.sourceVersion) {
            throw new Error(`Collection ${definition.kind} declares conflicting ranges for ${endpoint.source}`);
        }
        sources.set(endpoint.source, endpoint.sourceVersion);
    }
    for (const requirement of definition.resources.flatMap((resource) => resource.requires?.collections ?? [])) {
        const existing = collections.get(requirement.kind);
        if (existing && existing !== requirement.versionRange) {
            throw new Error(`Collection ${definition.kind} declares conflicting ranges for ${requirement.kind}`);
        }
        collections.set(requirement.kind, requirement.versionRange);
    }
    for (const dependency of definition.theme?.dependencies ?? []) {
        const existing = collections.get(dependency.kind);
        if (existing && existing !== dependency.versionRange) {
            throw new Error(`Collection ${definition.kind} declares conflicting ranges for ${dependency.kind}`);
        }
        collections.set(dependency.kind, dependency.versionRange);
    }
    return [
        ...declared,
        ...[...collections].map(([kind, versionRange]) => ({ kind, versionRange })),
        ...[...sources].map(([kind, versionRange]) => ({ kind, versionRange })),
    ];
}

function olderRecords(records: readonly LocalPackageRecord[], kind: string, version: string): LocalPackageRecord[] {
    return records
        .filter((record) => record.kind === kind && compare(record.version, version) < 0)
        .sort((left, right) => compare(left.version, right.version));
}

function eligibleOlderRecords(
    records: readonly LocalPackageRecord[],
    kind: string,
    version: string,
    publishedVersions: ReadonlySet<string>,
): LocalPackageRecord[] {
    return olderRecords(records, kind, version).filter(
        (record) =>
            record.admission?.status !== "rejected" &&
            (record.source.startsWith("local:") || publishedVersions.has(record.version)),
    );
}

function coordinate(kind: string, version: string): string {
    return `${kind}@${version}`;
}
