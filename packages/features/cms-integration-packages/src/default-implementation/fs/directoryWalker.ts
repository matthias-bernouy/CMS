import { Buffer } from "node:buffer";
import type { Dirent, Stats } from "node:fs";
import { lstat, opendir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import type { IntegrationPackageFileV1, IntegrationPackageLimits } from "../../interfaces/envelope";
import type { CanonicalFile, CanonicalFileSet, CanonicalFileSetLimits } from "../../interfaces/fileSet";
import { readBoundedRegularFile } from "./boundedFile";

type WalkState = {
    decodedBytes: number;
    directories: number;
    files: number;
    output: CanonicalFileSet;
};

const utf8 = new TextEncoder();
const strictUtf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

export async function readIntegrationPackageFiles(
    requestedRoot: string,
    limits: Readonly<IntegrationPackageLimits>,
): Promise<Record<string, IntegrationPackageFileV1>> {
    return readCanonicalFileSetDirectory(requestedRoot, limits);
}

export async function readCanonicalFileSetDirectory(
    requestedRoot: string,
    limits: Readonly<CanonicalFileSetLimits>,
): Promise<CanonicalFileSet> {
    const rootStats = await lstat(requestedRoot);
    if (rootStats.isSymbolicLink()) {
        throw new Error("Integration package root must not be a symlink");
    }
    if (!rootStats.isDirectory()) {
        throw new Error("Integration package root must be a directory");
    }
    const root = await realpath(requestedRoot);
    const canonicalRootStats = await lstat(root);
    assertSameEntry(rootStats, canonicalRootStats, ".");
    const state: WalkState = {
        decodedBytes: 0,
        directories: 1,
        files: 0,
        output: Object.create(null) as CanonicalFileSet,
    };
    await walkDirectory(root, root, "", 0, state, limits);
    assertStableEntry(canonicalRootStats, await lstat(root), ".");
    return state.output;
}

async function walkDirectory(
    root: string,
    directory: string,
    prefix: string,
    depth: number,
    state: WalkState,
    limits: Readonly<IntegrationPackageLimits>,
): Promise<void> {
    const canonicalDirectory = await realpath(directory);
    assertWithinRoot(root, canonicalDirectory, prefix || ".");
    const directoryStats = await lstat(canonicalDirectory);
    if (!directoryStats.isDirectory()) {
        throw new Error(`Integration package directory changed while reading: ${prefix || "."}`);
    }
    const entries = await readBoundedEntries(canonicalDirectory, state, limits);
    for (const entry of entries) {
        assertSegment(entry.name, limits);
        const entryDepth = depth + 1;
        if (entryDepth > limits.maxDepth) {
            throw new Error(
                `Integration package path exceeds depth ${limits.maxDepth}: ${joinPath(prefix, entry.name)}`,
            );
        }
        const packagePath = joinPath(prefix, entry.name);
        assertPathBytes(packagePath, limits);
        const entryPath = join(canonicalDirectory, entry.name);
        const stats = await lstat(entryPath);
        if (stats.isSymbolicLink()) {
            throw new Error(`Integration package must not contain symlinks: ${packagePath}`);
        }
        if (!stats.isDirectory() && !stats.isFile()) {
            throw new Error(`Integration package entry must be a regular file or directory: ${packagePath}`);
        }
        const canonicalEntry = await realpath(entryPath);
        assertWithinRoot(root, canonicalEntry, packagePath);
        if (stats.isDirectory()) {
            state.directories += 1;
            if (state.directories > limits.maxDirectories) {
                throw new Error(`Integration package exceeds ${limits.maxDirectories} directories: ${packagePath}`);
            }
            await walkDirectory(root, canonicalEntry, packagePath, entryDepth, state, limits);
            continue;
        }
        state.files += 1;
        if (state.files > limits.maxFiles) {
            throw new Error(`Integration package exceeds ${limits.maxFiles} files: ${packagePath}`);
        }
        const bytes = await readBoundedRegularFile(entryPath, state.decodedBytes, limits);
        state.decodedBytes += bytes.byteLength;
        state.output[packagePath] = encodeFile(bytes);
    }
    assertStableEntry(directoryStats, await lstat(canonicalDirectory), prefix || ".");
}

async function readBoundedEntries(
    directory: string,
    state: Readonly<WalkState>,
    limits: Readonly<IntegrationPackageLimits>,
): Promise<Dirent[]> {
    const remainingEntries = limits.maxFiles - state.files + (limits.maxDirectories - state.directories);
    const entries: Dirent[] = [];
    const handle = await opendir(directory);
    for await (const entry of handle) {
        entries.push(entry);
        if (entries.length > remainingEntries) {
            throw new Error("Integration package directory exceeds the remaining file and directory limits");
        }
    }
    return entries.sort(compareEntries);
}

function encodeFile(bytes: Uint8Array): CanonicalFile {
    try {
        return { encoding: "utf8", content: strictUtf8.decode(bytes) };
    } catch {
        return { encoding: "base64", content: Buffer.from(bytes).toString("base64") };
    }
}

function assertSegment(segment: string, limits: Readonly<IntegrationPackageLimits>): void {
    if (!segment || segment === "." || segment === ".." || segment.includes("\\") || segment.includes("\0")) {
        throw new Error(`Invalid integration package path segment: ${JSON.stringify(segment)}`);
    }
    if (utf8.encode(segment).byteLength > limits.maxSegmentBytes) {
        throw new Error(`Integration package path segment exceeds ${limits.maxSegmentBytes} UTF-8 bytes: ${segment}`);
    }
}

function assertPathBytes(path: string, limits: Readonly<IntegrationPackageLimits>): void {
    if (utf8.encode(path).byteLength > limits.maxPathBytes) {
        throw new Error(`Integration package path exceeds ${limits.maxPathBytes} UTF-8 bytes: ${path}`);
    }
}

function assertWithinRoot(root: string, target: string, source: string): void {
    const relation = relative(root, target);
    if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
        throw new Error(`Integration package path escapes its root: ${source}`);
    }
}

function joinPath(prefix: string, segment: string): string {
    return prefix ? `${prefix}/${segment}` : segment;
}

function compareEntries(left: { name: string }, right: { name: string }): number {
    return left.name < right.name ? -1 : left.name > right.name ? 1 : 0;
}

function assertSameEntry(expected: Stats, actual: Stats, source: string): void {
    if (expected.dev !== actual.dev || expected.ino !== actual.ino) {
        throw new Error(`Integration package entry changed while reading: ${source}`);
    }
}

function assertStableEntry(expected: Stats, actual: Stats, source: string): void {
    assertSameEntry(expected, actual, source);
    if (expected.mtimeMs !== actual.mtimeMs || expected.ctimeMs !== actual.ctimeMs) {
        throw new Error(`Integration package entry changed while reading: ${source}`);
    }
}
