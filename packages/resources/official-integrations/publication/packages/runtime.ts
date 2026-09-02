import type { Dirent } from "node:fs";
import { lstat, opendir, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { readIntegrationPackageDirectory } from "@bernouy/cms-integration-packages/fs";
import { FsIntegrationDefinitionRepository, parseIntegrationDefinitionIndex } from "@bernouy/cms-integrations/fs";
import { compare as compareSemVer } from "semver";
import { OFFICIAL_INTEGRATIONS_ROOT } from "../../index";
import type { BuiltOfficialIntegrationPackage, OfficialIntegrationPackage } from "../contracts";
import { assertWithin, compareText, joinWithin, portableRelative, readBoundedJsonDocument } from "../filesystem";
import { loadOfficialIntegrationPackageHistory } from "./history";

const MAX_DISCOVERY_DEPTH = 8;
const MAX_DISCOVERY_ENTRIES = 8_192;
const MAX_INTEGRATION_INDEX_BYTES = 256 * 1_024;

export async function buildOfficialIntegrationPackages(
    requestedRoot: string = OFFICIAL_INTEGRATIONS_ROOT,
): Promise<readonly BuiltOfficialIntegrationPackage[]> {
    const indexPaths = await discoverIntegrationIndexes(requestedRoot);
    const definitions = new FsIntegrationDefinitionRepository(requestedRoot);
    const packages: BuiltOfficialIntegrationPackage[] = [];
    const identities = new Set<string>();
    const kinds = new Set<string>();
    for (const indexPath of indexPaths) {
        const integrationRoot = resolve(indexPath, "..");
        const index = parseIntegrationDefinitionIndex(
            (await readBoundedJsonDocument(indexPath, MAX_INTEGRATION_INDEX_BYTES)).value,
            indexPath,
        );
        if (kinds.has(index.kind)) {
            throw new Error(`Official integration kind is duplicated: ${index.kind}`);
        }
        kinds.add(index.kind);
        for (const entry of [...index.versions].sort((left, right) => compareVersions(left.version, right.version))) {
            const identity = `${index.kind}\0${entry.version}`;
            if (identities.has(identity)) {
                throw new Error(`Official integration package identity is duplicated: ${index.kind}@${entry.version}`);
            }
            identities.add(identity);
            const versionRoot = joinWithin(integrationRoot, entry.path);
            const definitionPath = joinWithin(integrationRoot, entry.definition);
            const resolved = await readIntegrationPackageDirectory({
                root: versionRoot,
                kind: index.kind,
                version: entry.version,
                definition: portableRelative(versionRoot, definitionPath),
                releaseNotes: await officialReleaseNotesPath(versionRoot),
                ...(entry.path === "." ? { excludeRootEntries: [".registry", "integration.json", "tests"] } : {}),
            });
            const definition = await definitions.get(index.kind, entry.version);
            if (!definition) {
                throw new Error(`Official package definition disappeared: ${index.kind}@${entry.version}`);
            }
            packages.push({
                kind: index.kind,
                version: entry.version,
                digest: resolved.digest,
                canonicalBytes: resolved.canonicalBytes,
                package: resolved,
                definition,
                sourceRoot: versionRoot,
            });
        }
    }
    for (const integrationPackage of await loadOfficialIntegrationPackageHistory(requestedRoot)) {
        const identity = `${integrationPackage.kind}\0${integrationPackage.version}`;
        if (identities.has(identity)) {
            throw new Error(
                `Official integration package identity is duplicated: ${integrationPackage.kind}@${integrationPackage.version}`,
            );
        }
        identities.add(identity);
        packages.push(integrationPackage);
    }
    return Object.freeze(packages.sort(comparePackages));
}

async function officialReleaseNotesPath(versionRoot: string): Promise<string> {
    const plainText = joinWithin(versionRoot, "release-notes.txt");
    try {
        await lstat(plainText);
        return "release-notes.txt";
    } catch (error) {
        if (isNotFound(error)) {
            return "README.md";
        }
        throw error;
    }
}

function isNotFound(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function discoverIntegrationIndexes(requestedRoot: string): Promise<readonly string[]> {
    const requestedStats = await lstat(requestedRoot);
    if (requestedStats.isSymbolicLink() || !requestedStats.isDirectory()) {
        throw new Error("Official integrations root must be a non-symlink directory");
    }
    const root = await realpath(requestedRoot);
    const state = { entries: 0, indexes: [] as string[] };
    await walkForIndexes(root, root, 0, state);
    if (state.indexes.length === 0) {
        throw new Error("Official integrations root contains no integration indexes");
    }
    return state.indexes.sort(compareText);
}

async function walkForIndexes(
    root: string,
    directory: string,
    depth: number,
    state: { entries: number; indexes: string[] },
): Promise<void> {
    if (depth > MAX_DISCOVERY_DEPTH) {
        throw new Error("Official integration discovery exceeds its directory depth limit");
    }
    const entries = await readDirectoryEntries(directory, state);
    const index = entries.find((entry) => entry.name === "integration.json");
    if (index) {
        if (!index.isFile()) {
            throw new Error("Official integration index must be a regular file");
        }
        state.indexes.push(join(directory, index.name));
        return;
    }
    for (const entry of entries) {
        if (entry.isSymbolicLink()) {
            throw new Error("Official integration discovery must not follow symlinks");
        }
        if (directory === root && entry.name === ".registry") {
            continue;
        }
        if (entry.isDirectory()) {
            const child = await realpath(join(directory, entry.name));
            assertWithin(root, child);
            await walkForIndexes(root, child, depth + 1, state);
        } else if (!entry.isFile()) {
            throw new Error("Official integration discovery accepts only regular files and directories");
        }
    }
}

async function readDirectoryEntries(directory: string, state: { entries: number }): Promise<Dirent[]> {
    const entries: Dirent[] = [];
    const handle = await opendir(directory);
    for await (const entry of handle) {
        state.entries += 1;
        if (state.entries > MAX_DISCOVERY_ENTRIES) {
            throw new Error("Official integration discovery exceeds its entry limit");
        }
        entries.push(entry);
    }
    return entries.sort((left, right) => compareText(left.name, right.name));
}

function comparePackages(left: OfficialIntegrationPackage, right: OfficialIntegrationPackage): number {
    return compareText(left.kind, right.kind) || compareVersions(left.version, right.version);
}

function compareVersions(left: string, right: string): number {
    return compareSemVer(left, right) || compareText(left, right);
}
