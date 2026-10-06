import { stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { DEFAULT_COLLECTION_LIMITS } from "@bernouy/cms-repository/collections";
import { readSourceEntries } from "./sourceTree";

const MAX_BLOC_DEPTH = 16;
const BLOC_ENTRIES = new Set([
    "bloc.ts",
    "default.html",
    "definition.json",
    "lightdom.html",
    "runtime",
    "settings",
    "shadowdom.html",
    "style.css",
]);

export type BlocSource = Readonly<{
    id: string;
    root: string;
    relativePath: string;
    definition: Record<string, unknown>;
}>;

export async function discoverCollectionBlocSources(directory: string): Promise<BlocSource[]> {
    if (!(await directoryExists(directory))) {
        return [];
    }
    const sources: BlocSource[] = [];
    await visitBlocSources(directory, directory, 0, sources);
    return sources;
}

async function visitBlocSources(base: string, directory: string, depth: number, sources: BlocSource[]): Promise<void> {
    if (depth > MAX_BLOC_DEPTH) {
        throw new Error(`Bloc source tree must not exceed ${MAX_BLOC_DEPTH} directory levels`);
    }
    const entries = await readSourceEntries(directory);
    const definition = entries.find((entry) => entry.name === "definition.json" && entry.isFile());
    if (definition) {
        const relativePath = directory.slice(base.length + 1).replaceAll("\\", "/");
        const value: unknown = await Bun.file(join(directory, definition.name)).json();
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            throw new Error(`Bloc source ${relativePath} requires an object definition with a string id`);
        }
        const source = value as Record<string, unknown>;
        if (typeof source.id !== "string") {
            throw new Error(`Bloc source ${relativePath} requires an object definition with a string id`);
        }
        if (basename(directory) !== source.id) {
            throw new Error(`Bloc folder ${relativePath} must be named after its id ${JSON.stringify(source.id)}`);
        }
        validateBlocEntries(entries, relativePath);
        sources.push({ id: source.id, root: directory, relativePath, definition: source });
        if (sources.length > DEFAULT_COLLECTION_LIMITS.maxBlocs) {
            throw new Error(`Bloc source tree must contain at most ${DEFAULT_COLLECTION_LIMITS.maxBlocs} Blocs`);
        }
        return;
    }
    for (const entry of entries) {
        if (!entry.isDirectory()) {
            const path = join(directory, entry.name)
                .slice(base.length + 1)
                .replaceAll("\\", "/");
            throw new Error(`Bloc grouping directories may not contain files: ${path}`);
        }
        await visitBlocSources(base, join(directory, entry.name), depth + 1, sources);
    }
}

function validateBlocEntries(entries: Awaited<ReturnType<typeof readSourceEntries>>, relativePath: string): void {
    for (const entry of entries) {
        if (!BLOC_ENTRIES.has(entry.name)) {
            throw new Error(`Unsupported entry in Bloc ${relativePath}: ${entry.name}`);
        }
        if (["settings", "runtime"].includes(entry.name) ? !entry.isDirectory() : !entry.isFile()) {
            throw new Error(`Invalid entry type in Bloc ${relativePath}: ${entry.name}`);
        }
    }
}

async function directoryExists(directory: string): Promise<boolean> {
    try {
        return (await stat(directory)).isDirectory();
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return false;
        }
        throw error;
    }
}
