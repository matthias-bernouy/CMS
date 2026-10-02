import { readdir } from "node:fs/promises";
import { join } from "node:path";

const MAX_TREE_DEPTH = 16;
const MAX_JSON_FILES = 2_048;

export type JsonSourceFile = Readonly<{
    absolutePath: string;
    relativePath: string;
}>;

export async function scanJsonSourceTree(
    root: string,
    excludedRootFiles: ReadonlySet<string> = new Set(),
): Promise<JsonSourceFile[]> {
    const files: JsonSourceFile[] = [];
    await visitJsonTree(root, root, 0, excludedRootFiles, files);
    return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

export async function readSourceEntries(directory: string) {
    return (await readdir(directory, { withFileTypes: true })).sort((left, right) =>
        left.name.localeCompare(right.name),
    );
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
    for (const entry of await readSourceEntries(directory)) {
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
