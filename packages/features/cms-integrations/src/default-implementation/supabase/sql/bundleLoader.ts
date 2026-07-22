import { readFile, stat } from "node:fs/promises";
import { dirname, relative, sep } from "node:path";
import { IntegrationRuntimeError } from "../../../core/errors";
import { SUPABASE_SQL_BUNDLE_LIMITS, type SupabaseSqlBundleLimits } from "./constants";
import { parseSupabaseSqlManifest } from "./manifestParsing";
import { assertWithin, resolveSqlReference } from "./pathSecurity";

type SqlFragment = { source: string; sql: string };

type LoadState = {
    bundleRoot: string;
    connectorRoot: string;
    bytes: number;
    files: number;
    fragments: Set<string>;
    stack: string[];
    limits: SupabaseSqlBundleLimits;
};

export type LoadedSupabaseSqlBundle = {
    sql: string;
    sourceFiles: string[];
};

export async function assembleSupabaseSqlBundle(
    connectorRoot: string,
    manifestPath: string,
): Promise<LoadedSupabaseSqlBundle> {
    const bundleRoot = dirname(manifestPath);
    assertWithin(connectorRoot, manifestPath, "Supabase connector root", manifestPath);
    const state: LoadState = {
        bundleRoot,
        connectorRoot,
        bytes: 0,
        files: 0,
        fragments: new Set(),
        stack: [],
        limits: SUPABASE_SQL_BUNDLE_LIMITS,
    };
    const fragments = await loadManifest(manifestPath, 0, state);
    return {
        sql: assembleBundle(fragments),
        sourceFiles: fragments.map(({ source }) => source),
    };
}

async function loadManifest(path: string, depth: number, state: LoadState): Promise<SqlFragment[]> {
    if (depth > state.limits.maxDepth) {
        throw new IntegrationRuntimeError(`Supabase SQL manifest depth exceeds ${state.limits.maxDepth}`);
    }
    const cycleIndex = state.stack.indexOf(path);
    if (cycleIndex >= 0) {
        const cycle = [...state.stack.slice(cycleIndex), path].map((entry) => displayPath(state, entry)).join(" -> ");
        throw new IntegrationRuntimeError(`Supabase SQL manifest cycle detected: ${cycle}`);
    }
    state.stack.push(path);
    try {
        const text = await readLimited(path, state);
        const manifest = parseSupabaseSqlManifest(parseJson(text, displayPath(state, path)), displayPath(state, path));
        const fragments: SqlFragment[] = [];
        for (const entry of manifest.entries) {
            if ("file" in entry) {
                fragments.push(await loadFragment(path, entry.file, state));
            } else {
                const nested = await resolveSqlReference({
                    connectorRoot: state.connectorRoot,
                    bundleRoot: state.bundleRoot,
                    fromFile: path,
                    reference: entry.manifest,
                    extension: ".json",
                });
                fragments.push(...(await loadManifest(nested, depth + 1, state)));
            }
        }
        return fragments;
    } finally {
        state.stack.pop();
    }
}

async function loadFragment(manifest: string, reference: string, state: LoadState): Promise<SqlFragment> {
    const path = await resolveSqlReference({
        connectorRoot: state.connectorRoot,
        bundleRoot: state.bundleRoot,
        fromFile: manifest,
        reference,
        extension: ".sql",
    });
    if (state.fragments.has(path)) {
        throw new IntegrationRuntimeError(
            `Supabase SQL fragment is included more than once: ${displayPath(state, path)}`,
        );
    }
    state.fragments.add(path);
    return { source: displayPath(state, path), sql: await readLimited(path, state) };
}

async function readLimited(path: string, state: LoadState): Promise<string> {
    state.files += 1;
    if (state.files > state.limits.maxFiles) {
        throw new IntegrationRuntimeError(`Supabase SQL bundle exceeds ${state.limits.maxFiles} files`);
    }
    const size = (await stat(path)).size;
    if (state.bytes + size > state.limits.maxBytes) {
        throw new IntegrationRuntimeError(`Supabase SQL bundle exceeds ${state.limits.maxBytes} bytes`);
    }
    const text = await readFile(path, "utf-8");
    state.bytes += Buffer.byteLength(text);
    if (state.bytes > state.limits.maxBytes) {
        throw new IntegrationRuntimeError(`Supabase SQL bundle exceeds ${state.limits.maxBytes} bytes`);
    }
    return text;
}

function parseJson(text: string, source: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        throw new IntegrationRuntimeError(`Invalid JSON in Supabase SQL manifest ${source}`);
    }
}

function assembleBundle(fragments: SqlFragment[]): string {
    const parts = ["BEGIN;\n"];
    for (const fragment of fragments) {
        parts.push(`-- cms-integration-sql-source: ${fragment.source}\n`, fragment.sql);
        if (!fragment.sql.endsWith("\n")) {
            parts.push("\n");
        }
        parts.push(`-- cms-integration-sql-source-end: ${fragment.source}\n`);
    }
    parts.push("COMMIT;\n");
    return parts.join("");
}

function displayPath(state: LoadState, path: string): string {
    return relative(state.bundleRoot, path).split(sep).join("/");
}
