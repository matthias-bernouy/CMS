import { stat } from "node:fs/promises";
import { join } from "node:path";
import { readSourceEntries, scanJsonSourceTree } from "./sourceTree";

type TextDefinition = Readonly<{
    source: Record<string, unknown>;
    sourcePath: string;
}>;

/** Assemble recursive definitions and per-locale value fragments into release text records. */
export async function loadCollectionTexts(directory: string): Promise<unknown[]> {
    if (!(await directoryExists(directory))) {
        return [];
    }
    const entries = await readSourceEntries(directory);
    if (
        entries.length !== 2 ||
        entries.some((entry) => !entry.isDirectory() || !["definitions", "locales"].includes(entry.name))
    ) {
        throw new Error("Texts source must contain only definitions/ and locales/");
    }
    const definitions = await loadDefinitions(join(directory, "definitions"));
    const locales = await loadLocaleValues(join(directory, "locales"), definitions);
    return [...definitions.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([id, definition]) => ({
            ...definition.source,
            values: Object.fromEntries(
                [...locales.entries()].flatMap(([locale, values]) => {
                    const value = values.get(id);
                    return value === undefined ? [] : [[locale, value]];
                }),
            ),
        }));
}

async function loadDefinitions(directory: string): Promise<Map<string, TextDefinition>> {
    const files = await scanJsonSourceTree(directory);
    if (files.length === 0) {
        throw new Error("Texts definitions must contain at least one JSON file");
    }
    const definitions = new Map<string, TextDefinition>();
    for (const file of files) {
        const values: unknown = await Bun.file(file.absolutePath).json();
        if (!Array.isArray(values)) {
            throw new Error(`Text definitions file ${file.relativePath} must contain a JSON array`);
        }
        for (const value of values) {
            if (!value || typeof value !== "object" || Array.isArray(value)) {
                throw new Error(`Text definitions file ${file.relativePath} must contain only objects`);
            }
            const source = value as Record<string, unknown>;
            if (typeof source.id !== "string" || Object.hasOwn(source, "values")) {
                throw new Error(`Text definition in ${file.relativePath} requires a string id and no values field`);
            }
            const previous = definitions.get(source.id);
            if (previous) {
                throw new Error(
                    `Text definition ${JSON.stringify(source.id)} is declared by both ${previous.sourcePath} and ${file.relativePath}`,
                );
            }
            definitions.set(source.id, { source, sourcePath: file.relativePath });
        }
    }
    return definitions;
}

async function loadLocaleValues(
    directory: string,
    definitions: ReadonlyMap<string, TextDefinition>,
): Promise<Map<string, Map<string, unknown>>> {
    const locales = new Map<string, Map<string, unknown>>();
    for (const entry of await readSourceEntries(directory)) {
        if (!entry.isDirectory()) {
            throw new Error(`Text locale entry ${entry.name} must be a locale directory`);
        }
        const files = await scanJsonSourceTree(join(directory, entry.name));
        if (files.length === 0) {
            throw new Error(`Text locale ${entry.name} must contain at least one JSON file`);
        }
        const values = new Map<string, unknown>();
        const sources = new Map<string, string>();
        for (const file of files) {
            const fragment: unknown = await Bun.file(file.absolutePath).json();
            if (!fragment || typeof fragment !== "object" || Array.isArray(fragment)) {
                throw new Error(`Text locale file ${entry.name}/${file.relativePath} must contain a JSON object`);
            }
            for (const [id, value] of Object.entries(fragment)) {
                const previous = sources.get(id);
                if (previous) {
                    throw new Error(
                        `Text value ${JSON.stringify(id)} is declared by both ${entry.name}/${previous} and ${entry.name}/${file.relativePath}`,
                    );
                }
                if (!definitions.has(id)) {
                    throw new Error(
                        `Text locale ${entry.name}/${file.relativePath} defines unknown text ${JSON.stringify(id)}`,
                    );
                }
                values.set(id, value);
                sources.set(id, file.relativePath);
            }
        }
        locales.set(entry.name, values);
    }
    if (locales.size === 0) {
        throw new Error("Texts locales must contain at least one locale directory");
    }
    return locales;
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
