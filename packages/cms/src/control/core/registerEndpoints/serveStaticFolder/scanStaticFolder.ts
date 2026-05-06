import { Glob } from "bun";
import { join, resolve } from "node:path";

export async function scanStaticFolder() {
    const rootDir = resolve(import.meta.dir, "../../../static");

    const glob = new Glob("**/*");

    const files: { relativePath: string, absolutePath: string }[] = []
    for (const relativePath of glob.scanSync(rootDir)) {
        // Skip per-folder template wrappers — they're consumed by `prepareHtml`,
        // not exposed as routes.
        if (relativePath.split("/").some(seg => seg === "_template.html")) continue;

        const absolutePath = join(rootDir, relativePath);
        files.push({
            relativePath,
            absolutePath
        })
    }

    return files;
}

export const STATIC_ROOT_DIR = resolve(import.meta.dir, "../../../static");