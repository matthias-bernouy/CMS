import { readdir, access } from "node:fs/promises";
import { join } from "node:path";

export async function groupedPackageRoots(root: string, depth = 0): Promise<string[]> {
    if (depth > 8) {
        throw new Error(`Package grouping exceeds eight levels: ${root}`);
    }
    const roots: string[] = [];
    for (const entry of await readdir(root, { withFileTypes: true })) {
        if (
            !entry.isDirectory() ||
            entry.name.startsWith(".") ||
            entry.name === "node_modules" ||
            entry.name === "dist"
        ) {
            continue;
        }
        const path = join(root, entry.name);
        const packageRoot = await access(join(path, "package.json")).then(
            () => true,
            (error: NodeJS.ErrnoException) => {
                if (error.code === "ENOENT") {
                    return false;
                }
                throw error;
            },
        );
        roots.push(...(packageRoot ? [path] : await groupedPackageRoots(path, depth + 1)));
    }
    return roots;
}
