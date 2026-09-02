import { lstat, realpath } from "node:fs/promises";
import {
    assertIntegrationPackageKind,
    assertIntegrationPackageVersion,
    canonicalJsonBytes,
    parseIntegrationPackageEnvelope,
    resolveIntegrationPackageLimits,
    sha256Hex,
} from "@bernouy/cms-integration-packages";
import { loadIntegrationDefinitionFromPackageEnvelope } from "@bernouy/cms-integration-registry/fs";
import { compare as compareSemVer } from "semver";
import type { BuiltOfficialIntegrationPackage } from "../contracts";
import { assertWithin, compareText, joinWithin, readBoundedJsonDocument } from "../filesystem";

const HISTORY_INDEX_SCHEMA = "cms.integration.official-package-history.v1";
const HISTORY_INDEX_PATH = ".registry/packages/index.v1.json";
const MAX_HISTORY_INDEX_BYTES = 256 * 1_024;
const MAX_HISTORY_ENTRIES = 512;

type HistoryEntry = Readonly<{ kind: string; version: string; digest: string }>;

export async function loadOfficialIntegrationPackageHistory(
    requestedRoot: string,
): Promise<readonly BuiltOfficialIntegrationPackage[]> {
    const indexPath = joinWithin(requestedRoot, HISTORY_INDEX_PATH);
    let document: Awaited<ReturnType<typeof readBoundedJsonDocument>>;
    try {
        document = await readBoundedJsonDocument(indexPath, MAX_HISTORY_INDEX_BYTES);
    } catch (error) {
        if (isNotFound(error)) {
            return [];
        }
        throw error;
    }
    const entries = parseHistoryIndex(document.value);
    assertCanonicalDocument(document.bytes, { entries, schema: HISTORY_INDEX_SCHEMA });
    return await Promise.all(entries.map((entry) => loadHistoryEntry(requestedRoot, entry)));
}

async function loadHistoryEntry(requestedRoot: string, entry: HistoryEntry): Promise<BuiltOfficialIntegrationPackage> {
    const limits = resolveIntegrationPackageLimits();
    const objectRoot = joinWithin(requestedRoot, `.registry/packages/objects/sha256/${entry.digest}`);
    const objectStats = await lstat(objectRoot);
    if (objectStats.isSymbolicLink() || !objectStats.isDirectory()) {
        throw new Error("Official historical package object must be a non-symlink directory");
    }
    const canonicalObjectRoot = await realpath(objectRoot);
    assertWithin(requestedRoot, canonicalObjectRoot);
    const packageDocument = await readBoundedJsonDocument(
        joinWithin(canonicalObjectRoot, "package.json"),
        limits.maxDocumentBytes,
    );
    const envelope = parseIntegrationPackageEnvelope(packageDocument.bytes, { limits });
    const canonicalBytes = assertCanonicalDocument(packageDocument.bytes, envelope);
    if (envelope.kind !== entry.kind || envelope.version !== entry.version) {
        throw new Error("Official historical package identity differs from its index binding");
    }
    if ((await sha256Hex(canonicalBytes)) !== entry.digest) {
        throw new Error("Official historical package digest differs from its index binding");
    }
    return Object.freeze({
        ...entry,
        canonicalBytes,
        package: { envelope, canonicalBytes, digest: entry.digest },
        definition: loadIntegrationDefinitionFromPackageEnvelope(envelope, limits),
    });
}

function parseHistoryIndex(value: unknown): readonly HistoryEntry[] {
    const record = exactRecord(value, ["entries", "schema"], "Official package history index");
    if (record.schema !== HISTORY_INDEX_SCHEMA || !Array.isArray(record.entries)) {
        throw new Error("Official package history index has an invalid schema or entries list");
    }
    if (record.entries.length > MAX_HISTORY_ENTRIES) {
        throw new Error("Official package history index exceeds its entry limit");
    }
    const entries = record.entries.map((candidate) => parseHistoryEntry(candidate));
    const sorted = [...entries].sort(compareEntries);
    const identities = new Set<string>();
    for (const entry of sorted) {
        const identity = `${entry.kind}\0${entry.version}`;
        if (identities.has(identity)) {
            throw new Error(`Official package history identity is duplicated: ${entry.kind}@${entry.version}`);
        }
        identities.add(identity);
    }
    if (entries.some((entry, index) => entry !== sorted[index])) {
        throw new Error("Official package history entries must be sorted by kind and version");
    }
    return Object.freeze(entries);
}

function parseHistoryEntry(value: unknown): HistoryEntry {
    const record = exactRecord(value, ["digest", "kind", "version"], "Official package history entry");
    const kind = assertIntegrationPackageKind(record.kind);
    const version = assertIntegrationPackageVersion(record.version);
    if (typeof record.digest !== "string" || !/^[a-f0-9]{64}$/u.test(record.digest)) {
        throw new Error("Official package history digest must be a lowercase SHA-256 digest");
    }
    return Object.freeze({ digest: record.digest, kind, version });
}

function exactRecord(value: unknown, keys: readonly string[], source: string): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${source} must be an object`);
    }
    const record = value as Record<string, unknown>;
    if (Object.keys(record).sort(compareText).join("\0") !== [...keys].sort(compareText).join("\0")) {
        throw new Error(`${source} must contain exactly ${keys.join(", ")}`);
    }
    return record;
}

function assertCanonicalDocument(actual: Uint8Array, value: unknown): Uint8Array {
    const expected = canonicalJsonBytes(value);
    if (actual.byteLength !== expected.byteLength || !actual.every((byte, index) => byte === expected[index])) {
        throw new Error("Official package history document must be canonical JSON");
    }
    return expected;
}

function compareEntries(left: HistoryEntry, right: HistoryEntry): number {
    return compareText(left.kind, right.kind) || compareSemVer(left.version, right.version);
}

function isNotFound(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
}
