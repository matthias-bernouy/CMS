import { randomUUID } from "node:crypto";
import { chmod, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import { assertIntegrationPackageKind, assertIntegrationPackageVersion } from "@bernouy/cms-integration-packages";
import { parseIntegrationDefinition, type IntegrationDefinition } from "@bernouy/cms-integrations";

const SCHEMA = "ulvia.local-repository.v1" as const;
const MAX_MANIFEST_BYTES = 16 * 1_024 * 1_024;

export type LocalPackageRecord = Readonly<{
    kind: string;
    version: string;
    digest: string;
    verificationDigest?: string;
    source: string;
    pulledAt: string;
    admission?: LocalPackageAdmission;
    definition: IntegrationDefinition;
}>;

export type LocalPackageAdmission = Readonly<{
    status: "published" | "rejected";
    recordedAt: string;
    code?: string;
}>;

type LocalRepositoryManifest = Readonly<{
    schema: typeof SCHEMA;
    packages: readonly LocalPackageRecord[];
}>;

export async function readManifest(root: string): Promise<LocalRepositoryManifest> {
    const path = manifestPath(root);
    const bytes = await readFile(path).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
            return null;
        }
        throw error;
    });
    if (!bytes) {
        return { schema: SCHEMA, packages: [] };
    }
    if (bytes.byteLength > MAX_MANIFEST_BYTES) {
        throw new Error("Local repository manifest is too large");
    }
    return parseManifest(JSON.parse(new TextDecoder().decode(bytes)));
}

export async function writeManifest(root: string, records: readonly LocalPackageRecord[]): Promise<void> {
    const manifest: LocalRepositoryManifest = {
        schema: SCHEMA,
        packages: [...records].sort((left, right) => coordinate(left).localeCompare(coordinate(right))),
    };
    const path = manifestPath(root);
    const temporary = join(root, `.catalog-${randomUUID()}.tmp`);
    await writeFile(temporary, canonicalJsonBytes(manifest), { flag: "wx", mode: 0o600 });
    await rename(temporary, path);
    await chmod(path, 0o600);
}

function parseManifest(value: unknown): LocalRepositoryManifest {
    if (!isRecord(value) || value.schema !== SCHEMA || !Array.isArray(value.packages)) {
        throw new Error("Local repository manifest is invalid");
    }
    const packages = value.packages.map(parseRecord);
    if (new Set(packages.map(coordinate)).size !== packages.length) {
        throw new Error("Local repository manifest contains duplicate package coordinates");
    }
    return { schema: SCHEMA, packages };
}

function parseRecord(value: unknown): LocalPackageRecord {
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
    const definition = parseIntegrationDefinition(value.definition);
    if (definition.kind !== kind || definition.version !== version) {
        throw new Error("Local repository definition identity does not match its coordinate");
    }
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
        definition,
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

function manifestPath(root: string): string {
    return join(root, "catalog.json");
}

function coordinate(record: Pick<LocalPackageRecord, "kind" | "version">): string {
    return `${record.kind}@${record.version}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
