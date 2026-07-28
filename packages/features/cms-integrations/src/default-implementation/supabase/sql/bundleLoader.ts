import { resolveIntegrationPackageLimits } from "@bernouy/cms-integration-packages";
import { readBoundedRegularFile } from "@bernouy/cms-integration-packages/fs";
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

const SUPABASE_SQL_FILE_LIMITS = resolveIntegrationPackageLimits({
    maxDepth: SUPABASE_SQL_BUNDLE_LIMITS.maxDepth,
    maxFiles: SUPABASE_SQL_BUNDLE_LIMITS.maxFiles,
    maxFileBytes: SUPABASE_SQL_BUNDLE_LIMITS.maxBytes,
    maxDecodedBytes: SUPABASE_SQL_BUNDLE_LIMITS.maxBytes,
});

const strictUtf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

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
    let bytes: Uint8Array;
    try {
        bytes = await readBoundedRegularFile(path, state.bytes, {
            ...SUPABASE_SQL_FILE_LIMITS,
            maxFileBytes: state.limits.maxBytes,
            maxDecodedBytes: state.limits.maxBytes,
        });
    } catch (error) {
        if (error instanceof Error && error.message.includes("exceed")) {
            throw new IntegrationRuntimeError(`Supabase SQL bundle exceeds ${state.limits.maxBytes} bytes`);
        }
        throw error;
    }
    state.bytes += bytes.byteLength;
    try {
        return strictUtf8.decode(bytes);
    } catch {
        throw new IntegrationRuntimeError(`Supabase SQL bundle file must be valid UTF-8: ${displayPath(state, path)}`);
    }
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
