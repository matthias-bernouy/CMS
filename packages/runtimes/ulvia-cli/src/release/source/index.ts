import { DEFAULT_INTEGRATION_PACKAGE_LIMITS, parseStrictJsonDocument } from "@bernouy/cms-integration-packages";
import { readIntegrationPackageDirectory } from "@bernouy/cms-integration-packages/fs";
import { FsIntegrationDefinitionRepository, parseIntegrationDefinitionIndex } from "@bernouy/cms-integrations/fs";
import type { Dirent } from "node:fs";
import { lstat, opendir, readFile, realpath } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { rcompare } from "semver";
import type { LocalReleasePackage } from "../types";
import type { StoredIntegrationVerificationBundle } from "@bernouy/cms-integration-registry";
import { buildLocalVerificationBundle } from "./verification";

const MAX_DEPTH = 10;
const MAX_ENTRIES = 50_000;
const SKIPPED_DIRECTORIES = new Set([".git", "dist", "node_modules"]);
export type LocalReleaseSource = LocalReleasePackage &
    Readonly<{
        integrationRoot: string;
        verification: StoredIntegrationVerificationBundle;
    }>;

export async function listLocalReleaseKinds(searchRoot: string): Promise<readonly string[]> {
    const indexes = await discoverIntegrationIndexes(searchRoot);
    if (!indexes.length) {
        throw new Error(`Could not find integration sources under ${await realpath(searchRoot)}`);
    }
    const kinds = indexes.map((entry) => entry.kind);
    if (new Set(kinds).size !== kinds.length) {
        throw new Error("Several integration sources declare the same kind");
    }
    return kinds.sort((left, right) => left.localeCompare(right));
}

export async function readLocalReleaseSource(
    searchRoot: string,
    kind: string,
    version?: string,
): Promise<LocalReleaseSource> {
    const indexPath = await findIntegrationIndex(searchRoot, kind);
    const integrationRoot = dirname(indexPath);
    const index = parseIntegrationDefinitionIndex(parseJson(await readFile(indexPath)), indexPath);
    const selectedVersion = version ?? [...index.versions].map((entry) => entry.version).sort(rcompare)[0];
    const entry = index.versions.find((candidate) => candidate.version === selectedVersion);
    if (!entry) {
        throw new Error(`Integration source ${kind} does not declare version ${selectedVersion}`);
    }
    const versionRoot = await safeRealPath(integrationRoot, entry.path, "version root");
    const definitionPath = await safeRealPath(integrationRoot, entry.definition, "definition");
    assertWithin(versionRoot, definitionPath, "definition");
    const definition = portableRelative(versionRoot, definitionPath);
    const releaseNotes = await releaseNotesPath(versionRoot);
    const parsedDefinition = await new FsIntegrationDefinitionRepository(integrationRoot).get(kind, entry.version);
    if (!parsedDefinition) {
        throw new Error(`Integration definition disappeared: ${kind}@${entry.version}`);
    }
    const packageResult = await readIntegrationPackageDirectory({
        root: versionRoot,
        kind,
        version: entry.version,
        definition,
        releaseNotes,
        ...(entry.path === "." ? { excludeRootEntries: ["integration.json", "tests"] } : {}),
    });
    const verification = await buildLocalVerificationBundle(integrationRoot, {
        kind,
        version: entry.version,
        packageDigest: packageResult.digest,
    });
    return {
        integrationRoot,
        package: packageResult,
        definition: parsedDefinition,
        verification,
    };
}

async function findIntegrationIndex(searchRoot: string, kind: string): Promise<string> {
    const matches = (await discoverIntegrationIndexes(searchRoot)).filter((entry) => entry.kind === kind);
    if (matches.length !== 1) {
        throw new Error(
            matches.length === 0
                ? `Could not find integration source ${kind} under ${await realpath(searchRoot)}`
                : `Several integration sources declare kind ${kind}`,
        );
    }
    return matches[0]!.path;
}

async function discoverIntegrationIndexes(searchRoot: string): Promise<readonly { kind: string; path: string }[]> {
    const root = await realpath(searchRoot);
    if (!(await lstat(root)).isDirectory()) {
        throw new Error("Release source root must be a directory");
    }
    const state = { entries: 0, matches: [] as { kind: string; path: string }[] };
    await walk(root, 0, state);
    return state.matches;
}

async function walk(
    directory: string,
    depth: number,
    state: { entries: number; matches: { kind: string; path: string }[] },
): Promise<void> {
    if (depth > MAX_DEPTH) {
        return;
    }
    const entries = await readEntries(directory, state);
    const index = entries.find((entry) => entry.name === "integration.json" && entry.isFile());
    if (index) {
        const path = join(directory, index.name);
        const value = parseIntegrationDefinitionIndex(parseJson(await readFile(path)), path);
        state.matches.push({ kind: value.kind, path });
        return;
    }
    for (const entry of entries) {
        if (entry.isDirectory() && !SKIPPED_DIRECTORIES.has(entry.name)) {
            await walk(join(directory, entry.name), depth + 1, state);
        }
    }
}

async function readEntries(directory: string, state: { entries: number }): Promise<Dirent[]> {
    const entries: Dirent[] = [];
    const handle = await opendir(directory);
    for await (const entry of handle) {
        state.entries += 1;
        if (state.entries > MAX_ENTRIES) {
            throw new Error("Integration source discovery exceeded its entry limit");
        }
        if (!entry.isSymbolicLink()) {
            entries.push(entry);
        }
    }
    return entries.sort((left, right) => left.name.localeCompare(right.name));
}

async function safeRealPath(root: string, path: string, label: string): Promise<string> {
    const resolved = await realpath(resolve(root, path));
    assertWithin(root, resolved, label);
    return resolved;
}

function assertWithin(root: string, path: string, label: string): void {
    const child = relative(root, path);
    if (!child || (!child.startsWith(`..${sep}`) && child !== ".." && !child.startsWith(sep))) {
        return;
    }
    throw new Error(`Integration ${label} escapes its source root`);
}

function portableRelative(root: string, path: string): string {
    return relative(root, path).split(sep).join("/");
}

async function releaseNotesPath(versionRoot: string): Promise<string> {
    for (const name of ["release-notes.txt", "README.md"]) {
        const path = join(versionRoot, name);
        const regular = await lstat(path).then(
            (stats) => stats.isFile() && !stats.isSymbolicLink(),
            () => false,
        );
        if (regular) {
            return name;
        }
    }
    throw new Error("Integration version must contain release-notes.txt or README.md");
}

function parseJson(bytes: Uint8Array): unknown {
    return parseStrictJsonDocument(bytes, DEFAULT_INTEGRATION_PACKAGE_LIMITS.maxDocumentBytes);
}
