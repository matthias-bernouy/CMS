import { Glob } from "bun";
import { join, resolve } from "node:path";

export async function scanStaticFolder() {
    const rootDir = resolve(import.meta.dir, "../../../static");

    const glob = new Glob("**/*");

    const files: { relativePath: string, absolutePath: string }[] = []
    for (const relativePath of glob.scanSync(rootDir)) {
        const absolutePath = join(rootDir, relativePath);
        files.push({
            relativePath,
            absolutePath
        })
    }

    return files;
}