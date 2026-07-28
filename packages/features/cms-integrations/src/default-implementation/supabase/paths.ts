import type { Stats } from "node:fs";
import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { IntegrationRuntimeError } from "../../core/errors";

export function safeJoin(root: string, ...parts: string[]): string {
    const base = resolve(root);
    const target = resolve(base, ...parts);
    const relation = relative(base, target);
    if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
        throw new IntegrationRuntimeError(`Path escapes Supabase connector root: ${parts.join("/")}`);
    }
    return target;
}

export async function resolveExistingSupabaseDirectory(root: string, ...parts: string[]): Promise<string> {
    return await resolveExistingSupabaseEntry(root, "directory", parts);
}

export async function resolveExistingSupabaseFile(root: string, ...parts: string[]): Promise<string> {
    return await resolveExistingSupabaseEntry(root, "file", parts);
}

export function requiredText(value: string, name: string): string {
    const text = value.trim();
    if (!text) {
        throw new IntegrationRuntimeError(`Supabase connector deployer ${name} is required`);
    }
    return text;
}

type SupabaseEntryKind = "directory" | "file";

async function resolveExistingSupabaseEntry(
    requestedRoot: string,
    expectedKind: SupabaseEntryKind,
    parts: string[],
): Promise<string> {
    const root = resolve(requestedRoot);
    const rootStats = await entryStats(root, ".");
    if (rootStats.isSymbolicLink()) {
        throw new IntegrationRuntimeError("Supabase connector root must not be a symlink");
    }
    if (!rootStats.isDirectory()) {
        throw new IntegrationRuntimeError("Supabase connector root must be a directory");
    }
    const canonicalRoot = await realpath(root);
    assertSameEntry(rootStats, await lstat(canonicalRoot), ".");
    const target = safeJoin(canonicalRoot, ...parts);
    const relation = relative(canonicalRoot, target);
    const segments = relation ? relation.split(sep) : [];
    let current = canonicalRoot;
    let stats = rootStats;
    for (const [index, segment] of segments.entries()) {
        current = join(current, segment);
        stats = await entryStats(current, parts.join("/") || ".");
        if (stats.isSymbolicLink()) {
            await rejectSymbolicLink(canonicalRoot, current, parts.join("/") || ".");
        }
        if (index < segments.length - 1 && !stats.isDirectory()) {
            throw new IntegrationRuntimeError(`Supabase connector path component is not a directory: ${segment}`);
        }
    }
    assertExpectedKind(stats, expectedKind, parts.join("/") || ".");
    const canonicalTarget = await realpath(target);
    const canonicalStats = await lstat(canonicalTarget);
    assertSameEntry(stats, canonicalStats, parts.join("/") || ".");
    const canonicalRelation = relative(canonicalRoot, canonicalTarget);
    if (canonicalRelation === ".." || canonicalRelation.startsWith(`..${sep}`) || isAbsolute(canonicalRelation)) {
        throw new IntegrationRuntimeError(`Path escapes Supabase connector root: ${parts.join("/")}`);
    }
    return canonicalTarget;
}

async function entryStats(path: string, source: string): Promise<Stats> {
    try {
        return await lstat(path);
    } catch {
        throw new IntegrationRuntimeError(`Supabase connector path was not found: ${source}`);
    }
}

function assertExpectedKind(stats: Stats, expectedKind: SupabaseEntryKind, source: string): void {
    if (expectedKind === "directory" && !stats.isDirectory()) {
        throw new IntegrationRuntimeError(`Supabase connector path is not a directory: ${source}`);
    }
    if (expectedKind === "file" && !stats.isFile()) {
        throw new IntegrationRuntimeError(`Supabase connector path is not a file: ${source}`);
    }
}

function assertSameEntry(expected: Stats, actual: Stats, source: string): void {
    if (expected.dev !== actual.dev || expected.ino !== actual.ino) {
        throw new IntegrationRuntimeError(`Supabase connector path changed while resolving: ${source}`);
    }
}

async function rejectSymbolicLink(root: string, path: string, source: string): Promise<never> {
    try {
        const target = await realpath(path);
        const relation = relative(root, target);
        if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
            throw new IntegrationRuntimeError(`Path escapes Supabase connector root: ${source}`);
        }
    } catch (error) {
        if (error instanceof IntegrationRuntimeError) {
            throw error;
        }
    }
    throw new IntegrationRuntimeError(`Supabase connector path must not contain symlinks: ${source}`);
}
