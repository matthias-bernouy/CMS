import { decodeIntegrationPackageFile } from "@bernouy/cms-integration-packages";
import type {
    IntegrationAsset,
    IntegrationDefinitionIndex,
    IntegrationDefinitionSummary,
    IntegrationDefinitionVersion,
} from "@bernouy/cms-integrations";
import { compare, prerelease, rcompare } from "semver";
import type { LocalPackageRecord } from "./manifest";
import type { LocalIntegrationRepository } from "./local";

export class LocalRepositoryCatalog {
    constructor(private readonly repository: LocalIntegrationRepository) {}

    async list(): Promise<IntegrationDefinitionSummary[]> {
        const records = await this.repository.list();
        const kinds = [...new Set(records.map(({ kind }) => kind))].sort();
        return await Promise.all(kinds.map((kind) => this.summary(kind, records)));
    }

    async index(kind: string): Promise<IntegrationDefinitionIndex | null> {
        const records = (await this.repository.list()).filter((record) => record.kind === kind);
        if (!records.length) {
            return null;
        }
        const latest = newest(records);
        const stable = newestOrUndefined(records.filter(({ version }) => prerelease(version) === null));
        return {
            ...metadata(latest),
            ...(stable ? { stable: stable.version } : {}),
            latest: latest.version,
            versions: records.sort(byVersion).map(versionEntry),
        };
    }

    async versions(kind: string): Promise<IntegrationDefinitionVersion[]> {
        return (await this.index(kind))?.versions ?? [];
    }

    async record(kind: string, version?: string): Promise<LocalPackageRecord | null> {
        if (version) {
            return await this.repository.getRecord(kind, version);
        }
        const records = (await this.repository.list()).filter((record) => record.kind === kind);
        return records.length ? newest(records) : null;
    }

    async asset(record: LocalPackageRecord, path: string): Promise<IntegrationAsset | null> {
        const resolved = await this.repository.getPackage(record);
        const file = resolved.envelope.files[path];
        if (!file) {
            return null;
        }
        return { bytes: decodeIntegrationPackageFile(file), contentType: contentType(path) };
    }

    private async summary(kind: string, records: readonly LocalPackageRecord[]): Promise<IntegrationDefinitionSummary> {
        const index = await this.indexFrom(kind, records);
        return { ...index, versions: index.versions.map(({ version }) => version) };
    }

    private async indexFrom(kind: string, records: readonly LocalPackageRecord[]): Promise<IntegrationDefinitionIndex> {
        const selected = records.filter((record) => record.kind === kind);
        const latest = newest(selected);
        const stable = newestOrUndefined(selected.filter(({ version }) => prerelease(version) === null));
        return {
            ...metadata(latest),
            ...(stable ? { stable: stable.version } : {}),
            latest: latest.version,
            versions: selected.sort(byVersion).map(versionEntry),
        };
    }
}

function newest(records: readonly LocalPackageRecord[]): LocalPackageRecord {
    const record = [...records].sort((left, right) => rcompare(left.version, right.version))[0];
    if (!record) {
        throw new Error("Cannot select a version from an empty local integration");
    }
    return record;
}

function newestOrUndefined(records: readonly LocalPackageRecord[]): LocalPackageRecord | undefined {
    return records.length ? newest(records) : undefined;
}

function metadata(record: LocalPackageRecord) {
    const { kind, label, icon, category, description } = record.definition;
    return {
        kind,
        label,
        ...(icon ? { icon } : {}),
        ...(category ? { category } : {}),
        ...(description ? { description } : {}),
    };
}

function versionEntry(record: LocalPackageRecord): IntegrationDefinitionVersion {
    return {
        version: record.version,
        path: `${record.kind}/versions/${record.version}`,
        definition: "definition.json",
    };
}

function byVersion(left: LocalPackageRecord, right: LocalPackageRecord): number {
    return compare(left.version, right.version);
}

function contentType(path: string): string {
    if (path.endsWith(".svg")) {
        return "image/svg+xml";
    }
    if (path.endsWith(".json")) {
        return "application/json";
    }
    if (path.endsWith(".png")) {
        return "image/png";
    }
    if (path.endsWith(".jpg") || path.endsWith(".jpeg")) {
        return "image/jpeg";
    }
    return "application/octet-stream";
}
