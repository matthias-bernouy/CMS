import { basename, join } from "node:path";
import { readSourceEntries, scanJsonSourceTree } from "./sourceTree";

type ExportKind = "blocs" | "themeTokens" | "texts" | "assets" | "pages";

/** Expand authoring-only wildcards while keeping admitted releases explicit. */
export function expandCollectionSourceExports(
    value: unknown,
    resources: Readonly<Record<ExportKind, readonly string[]>>,
): unknown {
    if (value === undefined) {
        return undefined;
    }
    if (value === "*") {
        return explicitExports(resources);
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return value;
    }
    return Object.fromEntries(
        Object.entries(value).map(([key, selection]) => [
            key,
            selection === "*" && isExportKind(key) ? [...resources[key]] : selection,
        ]),
    );
}

function explicitExports(resources: Readonly<Record<ExportKind, readonly string[]>>) {
    return Object.fromEntries(Object.entries(resources).map(([key, ids]) => [key, [...ids]]));
}

function isExportKind(value: string): value is ExportKind {
    return ["blocs", "themeTokens", "texts", "assets", "pages"].includes(value);
}

/** Merge recursively authored locale fragments into one immutable catalogue candidate. */
export async function loadCollectionTranslations(directory: string): Promise<Record<string, unknown>> {
    const catalogues: [string, Record<string, unknown>][] = [];
    for (const entry of await readSourceEntries(directory)) {
        if (!entry.isDirectory()) {
            throw new Error(`Translation entry ${entry.name} must be a locale directory`);
        }
        const root = join(directory, entry.name);
        const files = await scanJsonSourceTree(root);
        if (files.length === 0) {
            throw new Error(`Translation locale ${entry.name} must contain at least one JSON file`);
        }
        const messages = new Map<string, { value: unknown; source: string }>();
        for (const file of files) {
            const value: unknown = await Bun.file(file.absolutePath).json();
            if (!value || typeof value !== "object" || Array.isArray(value)) {
                throw new Error(`Translation file ${entry.name}/${file.relativePath} must contain a JSON object`);
            }
            for (const [key, message] of Object.entries(value)) {
                const previous = messages.get(key);
                if (previous) {
                    throw new Error(
                        `Translation key ${JSON.stringify(key)} is declared by both ${entry.name}/${previous.source} and ${entry.name}/${file.relativePath}`,
                    );
                }
                messages.set(key, { value: message, source: file.relativePath });
            }
        }
        catalogues.push([entry.name, Object.fromEntries([...messages].map(([key, item]) => [key, item.value]))]);
    }
    return Object.fromEntries(catalogues);
}

/** Assemble recursively organized category files in the explicit manifest order. */
export async function loadCollectionTheme(directory: string): Promise<unknown | undefined> {
    const definitionFile = Bun.file(join(directory, "definition.json"));
    if (!(await definitionFile.exists())) {
        return undefined;
    }
    const definition = (await definitionFile.json()) as Record<string, unknown>;
    if (
        Object.keys(definition).some((key) => !["label", "categories"].includes(key)) ||
        !Array.isArray(definition.categories)
    ) {
        throw new Error("Theme definition accepts only label and an ordered categories array");
    }
    const categoryIds = definition.categories;
    if (
        categoryIds.some((id) => typeof id !== "string" || !/^[a-z][a-z0-9-]*$/u.test(id)) ||
        new Set(categoryIds).size !== categoryIds.length
    ) {
        throw new Error("Theme category references must be unique lowercase identifiers");
    }
    const categories = new Map<string, { value: Record<string, unknown>; source: string }>();
    for (const file of await scanJsonSourceTree(directory, new Set(["definition.json"]))) {
        const category = (await Bun.file(file.absolutePath).json()) as Record<string, unknown>;
        const id = category.id;
        if (typeof id !== "string" || basename(file.relativePath, ".json") !== id) {
            throw new Error(`Theme category file ${file.relativePath} must be named after its string id`);
        }
        const previous = categories.get(id);
        if (previous) {
            throw new Error(
                `Theme category ${JSON.stringify(id)} is declared by both ${previous.source} and ${file.relativePath}`,
            );
        }
        categories.set(id, { value: category, source: file.relativePath });
    }
    const orderedIds = categoryIds as string[];
    const missing = orderedIds.filter((id) => !categories.has(id));
    const extras = [...categories.keys()].filter((id) => !orderedIds.includes(id));
    if (missing.length || extras.length || categories.size !== orderedIds.length) {
        throw new Error("Theme category files must exactly match theme/definition.json");
    }
    return { label: definition.label, categories: orderedIds.map((id) => categories.get(id)!.value) };
}
