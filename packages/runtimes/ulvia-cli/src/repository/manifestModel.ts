import { assertIntegrationPackageKind, assertIntegrationPackageVersion } from "@bernouy/cms-integration-packages";
import {
    parseIntegrationDefinition,
    type IntegrationDefinition,
    type IntegrationDependency,
    type IntegrationIcon,
} from "@bernouy/cms-integrations";

const LEGACY_SCHEMA = "ulvia.local-repository.v1" as const;
export const LOCAL_REPOSITORY_SCHEMA = "ulvia.local-repository.v2" as const;

export type LocalPackageMetadata = Readonly<{
    label: string;
    type?: "source" | "collection";
    icon?: IntegrationIcon;
    category?: string;
    description?: string;
}>;

export type LocalPackageRecord = Readonly<{
    kind: string;
    version: string;
    digest: string;
    verificationDigest?: string;
    source: string;
    pulledAt: string;
    admission?: LocalPackageAdmission;
    metadata: LocalPackageMetadata;
    dependencies: readonly IntegrationDependency[];
}>;

export type LocalPackageAdmission = Readonly<{
    status: "published" | "rejected";
    recordedAt: string;
    code?: string;
}>;

export type LocalRepositoryManifest = Readonly<{
    schema: typeof LOCAL_REPOSITORY_SCHEMA;
    packages: readonly LocalPackageRecord[];
}>;

export function parseManifest(value: unknown): LocalRepositoryManifest {
    if (!isRecord(value) || !Array.isArray(value.packages)) {
        throw new Error("Local repository manifest is invalid");
    }
    const legacy = value.schema === LEGACY_SCHEMA;
    if (!legacy && value.schema !== LOCAL_REPOSITORY_SCHEMA) {
        throw new Error("Local repository manifest is invalid");
    }
    const packages = value.packages.map((record) => parseRecord(record, legacy));
    if (new Set(packages.map(coordinate)).size !== packages.length) {
        throw new Error("Local repository manifest contains duplicate package coordinates");
    }
    return { schema: LOCAL_REPOSITORY_SCHEMA, packages };
}

export function compactDefinitionRecord(
    definitionValue: unknown,
    expectedKind?: string,
    expectedVersion?: string,
): Pick<LocalPackageRecord, "metadata" | "dependencies"> {
    const definition = parseIntegrationDefinition(definitionValue);
    if (
        (expectedKind !== undefined && definition.kind !== expectedKind) ||
        (expectedVersion !== undefined && definition.version !== expectedVersion)
    ) {
        throw new Error("Local repository definition identity does not match its coordinate");
    }
    return {
        metadata: metadataFrom(definition),
        dependencies: definition.dependencies?.map((dependency) => ({ ...dependency })) ?? [],
    };
}

function parseRecord(value: unknown, legacy: boolean): LocalPackageRecord {
    if (!isRecord(value) || typeof value.digest !== "string" || !/^[a-f0-9]{64}$/u.test(value.digest)) {
        throw new Error("Local repository package record is invalid");
    }
    if (typeof value.source !== "string" || typeof value.pulledAt !== "string") {
        throw new Error("Local repository package provenance is invalid");
    }
    const pulledAt = new Date(value.pulledAt);
    if (!Number.isFinite(pulledAt.valueOf()) || pulledAt.toISOString() !== value.pulledAt) {
        throw new Error("Local repository package timestamp is invalid");
    }
    const kind = assertIntegrationPackageKind(value.kind);
    const version = assertIntegrationPackageVersion(value.version);
    const compact = legacy
        ? compactDefinitionRecord(value.definition, kind, version)
        : parseCompactRecord(value.metadata, value.dependencies, kind, version);
    const verificationDigest = optionalDigest(value.verificationDigest);
    const admission = optionalAdmission(value.admission);
    return {
        kind,
        version,
        digest: value.digest,
        ...(verificationDigest ? { verificationDigest } : {}),
        source: value.source,
        pulledAt: value.pulledAt,
        ...(admission ? { admission } : {}),
        ...compact,
    };
}

function parseCompactRecord(
    metadata: unknown,
    dependencies: unknown,
    kind: string,
    version: string,
): Pick<LocalPackageRecord, "metadata" | "dependencies"> {
    if (!isRecord(metadata) || !Array.isArray(dependencies)) {
        throw new Error("Local repository package summary is invalid");
    }
    const type = metadata.type;
    if (type !== undefined && type !== "source" && type !== "collection") {
        throw new Error("Local repository package type is invalid");
    }
    const compact = compactDefinitionRecord(
        {
            schema: "cms.integration.definition.v1",
            kind,
            version,
            label: metadata.label,
            category: metadata.category,
            description: metadata.description,
            icon: metadata.icon,
            inputs: [],
            dependencies,
        },
        kind,
        version,
    );
    return { ...compact, metadata: { ...compact.metadata, ...(type ? { type } : {}) } };
}

function metadataFrom(definition: IntegrationDefinition): LocalPackageMetadata {
    return {
        label: definition.label,
        ...(definition.type ? { type: definition.type } : {}),
        ...(definition.icon ? { icon: { ...definition.icon } } : {}),
        ...(definition.category ? { category: definition.category } : {}),
        ...(definition.description ? { description: definition.description } : {}),
    };
}

function optionalAdmission(value: unknown): LocalPackageAdmission | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (!isRecord(value) || (value.status !== "published" && value.status !== "rejected")) {
        throw new Error("Local repository package admission is invalid");
    }
    const recordedAt = new Date(typeof value.recordedAt === "string" ? value.recordedAt : Number.NaN);
    if (!Number.isFinite(recordedAt.valueOf()) || recordedAt.toISOString() !== value.recordedAt) {
        throw new Error("Local repository package admission timestamp is invalid");
    }
    if (value.code !== undefined && (typeof value.code !== "string" || !/^[a-z0-9_]{1,80}$/u.test(value.code))) {
        throw new Error("Local repository package admission code is invalid");
    }
    return {
        status: value.status,
        recordedAt: value.recordedAt,
        ...(typeof value.code === "string" ? { code: value.code } : {}),
    };
}

function optionalDigest(value: unknown): string | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) {
        throw new Error("Local repository verification digest is invalid");
    }
    return value;
}

function coordinate(record: Pick<LocalPackageRecord, "kind" | "version">): string {
    return `${record.kind}@${record.version}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
