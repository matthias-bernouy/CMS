import {
    integrationVersionSatisfies,
    isIntegrationDefinitionVersionInstallable,
    type IntegrationDefinitionVersion,
} from "@bernouy/cms-integrations";
import { compare, rcompare } from "semver";
import type { LocalIntegrationRepository } from "../repository/local";
import type { LocalPackageRecord } from "../repository/manifest";
import type { RemoteIntegrationRepository } from "../repository/remote";
import type { LocalReleasePackage } from "./types";

export async function loadLocalReleasePackages(
    records: readonly LocalPackageRecord[],
    repository: LocalIntegrationRepository,
): Promise<readonly LocalReleasePackage[]> {
    return await Promise.all(
        records.map(async (record) => ({
            package: await repository.getPackage(record),
            definition: record.definition,
        })),
    );
}

export async function ensureLocalBaselines(
    kind: string,
    candidateVersion: string,
    local: LocalIntegrationRepository,
    remote: RemoteIntegrationRepository,
    log: (message: string) => void,
    publishedVersions?: readonly IntegrationDefinitionVersion[],
): Promise<readonly LocalPackageRecord[]> {
    const published = publishedVersions ?? (await remote.versionEntries(kind));
    const versions = published
        .filter(isIntegrationDefinitionVersionInstallable)
        .map((entry) => entry.version)
        .filter((version) => compare(version, candidateVersion) < 0);
    const eligibleVersions = new Set(versions);
    let records = eligibleOlderRecords(await local.list(), kind, candidateVersion, eligibleVersions);
    for (const version of versions) {
        if (records.some((record) => record.version === version)) {
            continue;
        }
        const stored = await local.store(await remote.pull(kind, version));
        if (stored.added) {
            log(`↓ ${kind}@${version} baseline pulled`);
        }
    }
    records = eligibleOlderRecords(await local.list(), kind, candidateVersion, eligibleVersions);
    return records;
}

export async function resolveRequiredPackages(
    roots: readonly LocalReleasePackage[],
    local: LocalIntegrationRepository,
    remote: RemoteIntegrationRepository,
    log: (message: string) => void,
): Promise<readonly LocalReleasePackage[]> {
    const resolved = new Map<string, LocalReleasePackage>();
    const visiting = new Set<string>();
    const visit = async (owner: LocalReleasePackage): Promise<void> => {
        for (const dependency of [...(owner.definition.dependencies ?? [])]
            .filter((entry) => !entry.optional)
            .sort((left, right) => left.kind.localeCompare(right.kind))) {
            const selected = await resolveDependency(dependency.kind, dependency.versionRange, local, remote, log);
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
    remote: RemoteIntegrationRepository,
    log: (message: string) => void,
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
    let record = select(await local.list());
    if (!record) {
        const version = (await remote.versions(kind))
            .filter((candidate) => !versionRange || integrationVersionSatisfies(candidate, versionRange))
            .sort(rcompare)[0];
        if (!version) {
            throw new Error(`Required dependency ${kind}${versionRange ? `@${versionRange}` : ""} is unavailable`);
        }
        const stored = await local.store(await remote.pull(kind, version));
        record = stored.record;
        if (stored.added) {
            log(`↓ ${kind}@${version} dependency pulled`);
        }
    }
    return { package: await local.getPackage(record), definition: record.definition };
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
