import { Glob } from "bun";
import { join } from "node:path";

export async function scanStaticFolder(path: string) {
    const rootDir = path;

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