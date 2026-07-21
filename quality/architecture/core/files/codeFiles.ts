import { readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { CODE_EXTENSIONS, IGNORED_DIRECTORY_NAMES } from "../architectureTypes";
import { isIgnored, isMissingPathError, toRelativePath } from "../pathUtils";

export async function collectCodeFilesFromRoots(
    roots: readonly string[],
    repositoryRoot: string,
    ignoredPaths: readonly string[],
): Promise<string[]> {
    const files = new Set<string>();
    for (const root of roots) {
        for (const file of await collectCodeFiles(root, repositoryRoot, ignoredPaths)) {
            files.add(file);
        }
    }
    return [...files].sort();
}

export async function collectCodeFiles(
    root: string,
    repositoryRoot: string,
    ignoredPaths: readonly string[],
): Promise<string[]> {
    const files: string[] = [];

    async function visit(directory: string): Promise<void> {
        let entries;
        try {
            entries = await readdir(directory, { withFileTypes: true });
        } catch (error) {
            if (isMissingPathError(error)) {
                return;
            }
            throw error;
        }

        for (const entry of entries) {
            const absolutePath = join(directory, entry.name);
            const relativePath = toRelativePath(repositoryRoot, absolutePath);
            if (isIgnored(relativePath, ignoredPaths)) {
                continue;
            }
            if (entry.isDirectory()) {
                if (IGNORED_DIRECTORY_NAMES.has(entry.name)) {
                    continue;
                }
                await visit(absolutePath);
            } else if (entry.isFile() && CODE_EXTENSIONS.has(extname(entry.name))) {
                if (!entry.name.endsWith(".d.ts")) {
                    files.push(absolutePath);
                }
            }
        }
    }

    await visit(root);
    return files.sort();
}
