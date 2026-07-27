import { type SiteBlocDefinition, type SiteBlocSnapshot, validateSiteBlocDefinition } from "@bernouy/cms-content";
import { generateSiteBlocSourceBundle } from "@bernouy/cms-bloc-compile";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export const SITE_BLOC_BUILDER_FILE = "builder.json";
const EXCLUDED_DIRECTORIES = new Set(["node_modules", "dist", "tmp", ".cache", "build", ".git"]);

export type LocalSiteBlocDefinition = {
    folder: string;
    definition: SiteBlocDefinition;
};

export function parseSiteBlocDefinition(raw: string, label = SITE_BLOC_BUILDER_FILE): SiteBlocDefinition {
    let parsed: Record<string, unknown>;
    try {
        const value = JSON.parse(raw) as unknown;
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            throw new Error("JSON object expected");
        }
        parsed = value as Record<string, unknown>;
    } catch (error) {
        throw invalidBuilder(label, error);
    }

    try {
        if (parsed.schema !== "cms.site-bloc.v1") {
            throw new Error('schema must be "cms.site-bloc.v1"');
        }
        if (parsed.lifecycle !== "active" && parsed.lifecycle !== "archived") {
            throw new Error('lifecycle must be "active" or "archived"');
        }
        return validateSiteBlocDefinition({
            ...parsed,
            createdAt: parseDate(parsed.createdAt, "createdAt"),
            updatedAt: parseDate(parsed.updatedAt, "updatedAt"),
            ...(parsed.archivedAt !== undefined ? { archivedAt: parseDate(parsed.archivedAt, "archivedAt") } : {}),
        } as SiteBlocDefinition);
    } catch (error) {
        throw invalidBuilder(label, error);
    }
}

export async function readSiteBlocDefinition(folder: string): Promise<SiteBlocDefinition> {
    const file = join(folder, SITE_BLOC_BUILDER_FILE);
    return parseSiteBlocDefinition(await readFile(file, "utf-8"), file);
}

export async function scanSiteBlocDefinitions(root: string): Promise<LocalSiteBlocDefinition[]> {
    const definitions: LocalSiteBlocDefinition[] = [];
    await walkDefinitions(root, definitions);
    return definitions;
}

export function generateSiteBlocSource(
    definition: SiteBlocDefinition,
    snapshot?: SiteBlocSnapshot,
): Record<string, string> {
    return Object.fromEntries(
        Object.entries(generateSiteBlocSourceBundle(definition, snapshot)).map(([path, content]) => [
            path,
            Buffer.from(content, "utf-8").toString("base64"),
        ]),
    );
}

export function generateSiteBlocBuilderSource(definition: SiteBlocDefinition): string {
    const bundle = generateSiteBlocSourceBundle(definition, definition.draft);
    return Buffer.from(bundle[SITE_BLOC_BUILDER_FILE], "utf-8").toString("base64");
}

function parseDate(value: unknown, field: string): Date {
    if (typeof value !== "string") {
        throw new Error(`${field} must be an ISO date string`);
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) {
        throw new Error(`${field} must be a canonical ISO date string`);
    }
    return parsed;
}

async function walkDefinitions(folder: string, output: LocalSiteBlocDefinition[]): Promise<void> {
    let entries;
    try {
        entries = await readdir(folder, { withFileTypes: true });
    } catch {
        return;
    }
    if (entries.some((entry) => entry.isFile() && entry.name === SITE_BLOC_BUILDER_FILE)) {
        output.push({ folder, definition: await readSiteBlocDefinition(folder) });
    }
    const directories = entries
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && !EXCLUDED_DIRECTORIES.has(entry.name))
        .sort((left, right) => left.name.localeCompare(right.name));
    for (const directory of directories) {
        await walkDefinitions(join(folder, directory.name), output);
    }
}

function invalidBuilder(label: string, error: unknown): Error {
    const message = error instanceof Error ? error.message : String(error);
    return new Error(`Invalid ${label}: ${message}`);
}
