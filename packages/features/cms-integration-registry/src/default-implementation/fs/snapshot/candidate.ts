import { lstat, realpath } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
    decodedIntegrationPackageFileByteLength,
    type IntegrationPackageLimits,
    resolveIntegrationPackageLimits,
} from "@bernouy/cms-integration-packages";
import { readIntegrationPackageDirectory } from "@bernouy/cms-integration-packages/fs";
import type { IntegrationDefinitionIndex, IntegrationDefinitionVersion } from "@bernouy/cms-integrations";
import { parseIntegrationDefinitionIndex } from "@bernouy/cms-integrations/fs";
import type {
    IntegrationRegistryDiagnosticCode,
    IntegrationRegistryDiagnosticStage,
    IntegrationRegistryExactVersionLocation,
    IntegrationRegistryValidatedCatalogEntry,
} from "../../../interfaces/catalog";
import type { FsIntegrationRegistryCandidate } from "./discovery";
import { loadIntegrationDefinitionFromPackageEnvelope } from "../manifest/definition";
import { integrationRegistryVersionManifestPath } from "../manifest/paths";
import { readIntegrationRegistryVersionManifest } from "../manifest/reader";

const indexDecoder = new TextDecoder("utf-8", { fatal: true });

export class CandidateValidationError extends Error {
    constructor(
        readonly source: string,
        readonly stage: IntegrationRegistryDiagnosticStage,
        readonly code: IntegrationRegistryDiagnosticCode,
        readonly kind: string | undefined,
        readonly version: string | undefined,
        cause: unknown,
    ) {
        super(errorMessage(cause), { cause });
        this.name = "CandidateValidationError";
    }
}

export async function validateIntegrationCandidate(
    candidate: FsIntegrationRegistryCandidate,
    limitOverrides?: Partial<IntegrationPackageLimits>,
): Promise<IntegrationRegistryValidatedCatalogEntry> {
    let index: IntegrationDefinitionIndex;
    try {
        index = parseCapturedIndex(candidate);
    } catch (error) {
        throw candidateError(candidate.root, "index", undefined, undefined, error);
    }
    const limits = resolveIntegrationPackageLimits(limitOverrides);
    const versions: IntegrationRegistryExactVersionLocation[] = [];
    for (const entry of index.versions) {
        let paths: VersionPaths;
        try {
            paths = await resolveVersionPaths(candidate.root, entry);
        } catch (error) {
            throw candidateError(candidate.root, "version", index.kind, entry.version, error);
        }
        try {
            versions.push(await validateVersion(candidate.root, index.kind, entry, paths, limits));
        } catch (error) {
            throw candidateError(candidate.root, "package", index.kind, entry.version, error);
        }
    }
    return { source: candidate.root, index, versions };
}

async function validateVersion(
    integrationRoot: string,
    kind: string,
    entry: IntegrationDefinitionVersion,
    paths: VersionPaths,
    limits: Readonly<IntegrationPackageLimits>,
): Promise<IntegrationRegistryExactVersionLocation> {
    const requestedManifestPath = integrationRegistryVersionManifestPath(integrationRoot, entry.version);
    const manifest = await readIntegrationRegistryVersionManifest({
        path: requestedManifestPath,
        integrationRoot,
        expectedKind: kind,
        expectedVersion: entry.version,
        limits,
    });
    if (manifest && manifest.envelope.definition !== paths.definition) {
        throw new Error("Integration registry version manifest definition does not match integration.json");
    }
    const release = manifest ? { releaseNotes: manifest.envelope.releaseNotes! } : await legacyRelease(paths.root);
    const result = await readIntegrationPackageDirectory({
        root: paths.root,
        kind,
        version: entry.version,
        definition: paths.definition,
        ...release,
        ...(manifest ? { expectedEnvelope: manifest.envelope } : {}),
        ...(entry.path === "." ? { excludeRootEntries: ["integration.json", "tests"] } : {}),
        limits,
    });
    if (manifest && result.digest !== manifest.digest) {
        throw new Error("Integration registry version root does not reproduce its canonical manifest digest");
    }
    const definitionSnapshot = loadIntegrationDefinitionFromPackageEnvelope(result.envelope, limits);
    return {
        kind,
        version: entry.version,
        integrationRoot,
        packageRoot: paths.root,
        definition: paths.definition,
        definitionSnapshot,
        ...(result.envelope.releaseNotes ? { releaseNotes: result.envelope.releaseNotes } : {}),
        ...(!result.envelope.releaseNotes ? { legacy: true as const } : {}),
        ...(manifest ? { manifestPath: manifest.path } : {}),
        package: {
            schema: result.envelope.schema,
            digest: result.digest,
            canonicalBytes: result.canonicalBytes.byteLength,
            decodedBytes: Object.values(result.envelope.files).reduce(
                (total, file) => total + decodedIntegrationPackageFileByteLength(file),
                0,
            ),
            files: Object.keys(result.envelope.files).length,
        },
    };
}

function parseCapturedIndex(candidate: FsIntegrationRegistryCandidate): IntegrationDefinitionIndex {
    let parsed: unknown;
    try {
        parsed = JSON.parse(indexDecoder.decode(candidate.indexBytes));
    } catch (error) {
        throw new Error(`${candidate.indexPath}: invalid JSON: ${errorMessage(error)}`);
    }
    const index = parseIntegrationDefinitionIndex(parsed, candidate.indexPath);
    if (index.kind !== basename(candidate.root)) {
        throw new Error(
            `${candidate.indexPath}: index kind "${index.kind}" does not match directory "${basename(candidate.root)}"`,
        );
    }
    const versions = new Set<string>();
    const paths = new Set<string>();
    for (const entry of index.versions) {
        if (versions.has(entry.version)) {
            throw new Error(`${candidate.indexPath}: duplicate version "${entry.version}"`);
        }
        const path = pathWithin(candidate.root, entry.path, "version");
        if (paths.has(path)) {
            throw new Error(`${candidate.indexPath}: duplicate version path "${entry.path}"`);
        }
        versions.add(entry.version);
        paths.add(path);
    }
    return index;
}

type VersionPaths = Readonly<{ root: string; definition: string }>;

async function resolveVersionPaths(
    integrationRoot: string,
    entry: IntegrationDefinitionVersion,
): Promise<VersionPaths> {
    const root = pathWithin(integrationRoot, entry.path, "version");
    const rootMetadata = await lstat(root);
    if (rootMetadata.isSymbolicLink() || !rootMetadata.isDirectory()) {
        throw new Error(`Integration version root must be a non-symlink directory: ${entry.path}`);
    }
    const canonicalIntegrationRoot = await realpath(integrationRoot);
    const canonicalVersionRoot = await realpath(root);
    assertWithin(canonicalIntegrationRoot, canonicalVersionRoot, "version", entry.path);
    const definitionPath = pathWithin(integrationRoot, entry.definition, "definition");
    assertWithin(root, definitionPath, "version", entry.definition);
    const definition = relative(root, definitionPath).split(sep).join("/");
    if (!definition) {
        throw new Error("Integration definition path must reference a file inside its version root");
    }
    return { root, definition };
}

async function legacyRelease(versionRoot: string): Promise<{ releaseNotes: string } | { legacy: true }> {
    const releaseNotes = "README.md";
    try {
        const metadata = await lstat(join(versionRoot, releaseNotes));
        if (metadata.isSymbolicLink() || !metadata.isFile()) {
            throw new Error(`Integration release notes must be a regular file: ${join(versionRoot, releaseNotes)}`);
        }
        return { releaseNotes };
    } catch (error) {
        if (isNodeError(error) && error.code === "ENOENT") {
            return { legacy: true };
        }
        throw error;
    }
}

function pathWithin(root: string, path: string, boundary: string): string {
    const target = resolve(root, path);
    assertWithin(resolve(root), target, boundary, path);
    return target;
}

function assertWithin(root: string, target: string, boundary: string, source: string): void {
    const relation = relative(root, target);
    if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
        throw new Error(`Path escapes integration ${boundary} root: ${source}`);
    }
}

function candidateError(
    source: string,
    stage: "index" | "version" | "package",
    kind: string | undefined,
    version: string | undefined,
    cause: unknown,
): CandidateValidationError {
    const message = errorMessage(cause);
    const duplicateVersion = /duplicate version(?: path)?/i.test(message);
    return new CandidateValidationError(
        source,
        duplicateVersion ? "identity" : stage,
        duplicateVersion
            ? "duplicate-version-identity"
            : stage === "index"
              ? "invalid-integration"
              : stage === "version"
                ? "invalid-version"
                : "invalid-package",
        kind,
        version,
        cause,
    );
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
    return value instanceof Error && "code" in value;
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
