import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";

const MAX_TREE_DEPTH = 16;
const MAX_JSON_FILES = 2_048;

type JsonSourceFile = Readonly<{
    absolutePath: string;
    relativePath: string;
}>;

/** Merge recursively authored locale fragments into one immutable catalogue candidate. */
export async function loadCollectionTranslations(directory: string): Promise<Record<string, unknown>> {
    const catalogues: [string, Record<string, unknown>][] = [];
    for (const entry of await readEntries(directory)) {
        if (!entry.isDirectory()) {
            throw new Error(`Translation entry ${entry.name} must be a locale directory`);
        }
        const root = join(directory, entry.name);
        const files = await scanJsonTree(root);
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
    for (const file of await scanJsonTree(directory, new Set(["definition.json"]))) {
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

async function scanJsonTree(
    root: string,
    excludedRootFiles: ReadonlySet<string> = new Set(),
): Promise<JsonSourceFile[]> {
    const files: JsonSourceFile[] = [];
    await visitJsonTree(root, root, 0, excludedRootFiles, files);
    return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

async function visitJsonTree(
    root: string,
    directory: string,
    depth: number,
    excludedRootFiles: ReadonlySet<string>,
    files: JsonSourceFile[],
): Promise<void> {
    if (depth > MAX_TREE_DEPTH) {
        throw new Error(`JSON source tree must not exceed ${MAX_TREE_DEPTH} directory levels`);
    }
    for (const entry of await readEntries(directory)) {
        const absolutePath = join(directory, entry.name);
        const relativePath = absolutePath.slice(root.length + 1).replaceAll("\\", "/");
        if (entry.isDirectory()) {
            await visitJsonTree(root, absolutePath, depth + 1, excludedRootFiles, files);
            continue;
        }
        if (!entry.isFile() || !entry.name.endsWith(".json")) {
            throw new Error(`Unsupported entry in JSON source tree: ${relativePath}`);
        }
        if (depth === 0 && excludedRootFiles.has(entry.name)) {
            continue;
        }
        files.push({ absolutePath, relativePath });
        if (files.length > MAX_JSON_FILES) {
            throw new Error(`JSON source tree must contain at most ${MAX_JSON_FILES} files`);
        }
    }
}

async function readEntries(directory: string) {
    return (await readdir(directory, { withFileTypes: true })).sort((left, right) =>
        left.name.localeCompare(right.name),
    );
}
