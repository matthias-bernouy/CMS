import { constants, type Dirent } from "node:fs";
import { lstat, open, opendir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { ResolvedIntegrationPackage } from "@bernouy/cms-integration-packages";
import { readIntegrationPackageDirectory } from "@bernouy/cms-integration-packages/fs";
import { parseIntegrationDefinitionIndex } from "@bernouy/cms-integrations/fs";
import { compare as compareSemVer } from "semver";
import { OFFICIAL_INTEGRATIONS_ROOT } from "./index";

const MAX_DISCOVERY_DEPTH = 8;
const MAX_DISCOVERY_ENTRIES = 8_192;
const MAX_INTEGRATION_INDEX_BYTES = 256 * 1_024;

export type OfficialIntegrationPackage = Readonly<{
    kind: string;
    version: string;
    digest: string;
    canonicalBytes: Uint8Array;
}>;

export type BuiltOfficialIntegrationPackage = OfficialIntegrationPackage &
    Readonly<{ package: ResolvedIntegrationPackage }>;

export async function buildOfficialIntegrationPackages(
    requestedRoot: string = OFFICIAL_INTEGRATIONS_ROOT,
): Promise<readonly BuiltOfficialIntegrationPackage[]> {
    const indexPaths = await discoverIntegrationIndexes(requestedRoot);
    const packages: BuiltOfficialIntegrationPackage[] = [];
    const identities = new Set<string>();
    const kinds = new Set<string>();
    for (const indexPath of indexPaths) {
        const integrationRoot = resolve(indexPath, "..");
        const index = parseIntegrationDefinitionIndex(await readJson(indexPath), indexPath);
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
            const definition = portableRelative(versionRoot, definitionPath);
            const resolved = await readIntegrationPackageDirectory({
                root: versionRoot,
                kind: index.kind,
                version: entry.version,
                definition,
                releaseNotes: "README.md",
            });
            packages.push({
                kind: index.kind,
                version: entry.version,
                digest: resolved.digest,
                canonicalBytes: resolved.canonicalBytes,
                package: resolved,
            });
        }
    }
    return Object.freeze(packages.sort(comparePackages));
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

async function readJson(path: string): Promise<unknown> {
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
        const stats = await handle.stat();
        if (!stats.isFile() || stats.size < 1 || stats.size > MAX_INTEGRATION_INDEX_BYTES) {
            throw new Error("Official integration index must be a bounded regular JSON file");
        }
        const buffer = Buffer.alloc(MAX_INTEGRATION_INDEX_BYTES + 1);
        let offset = 0;
        while (offset < buffer.byteLength) {
            const { bytesRead } = await handle.read(buffer, offset, buffer.byteLength - offset, null);
            if (bytesRead === 0) {
                break;
            }
            offset += bytesRead;
        }
        if (offset < 1 || offset > MAX_INTEGRATION_INDEX_BYTES) {
            throw new Error("Official integration index must be a bounded regular JSON file");
        }
        return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, offset)));
    } finally {
        await handle.close();
    }
}

function joinWithin(root: string, source: string): string {
    if (isAbsolute(source)) {
        throw new Error("Official integration index path must be relative");
    }
    const target = resolve(root, source);
    assertWithin(root, target);
    return target;
}

function portableRelative(root: string, target: string): string {
    assertWithin(root, target);
    return relative(root, target).split(sep).join("/");
}

function assertWithin(root: string, target: string): void {
    const relation = relative(root, target);
    if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
        throw new Error("Official integration index path escapes its integration root");
    }
}

function comparePackages(left: OfficialIntegrationPackage, right: OfficialIntegrationPackage): number {
    return compareText(left.kind, right.kind) || compareVersions(left.version, right.version);
}

function compareVersions(left: string, right: string): number {
    return compareSemVer(left, right) || compareText(left, right);
}

function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}
