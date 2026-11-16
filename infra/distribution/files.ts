import { createHash } from "node:crypto";
import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";

export async function fileHash(path: string, algorithm = "sha256", encoding: "hex" | "base64" = "hex") {
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
        throw new Error(`Release artifact must be a regular file: ${path}`);
    }
    const hash = createHash(algorithm);
    for await (const chunk of Bun.file(path).stream()) {
        hash.update(chunk);
    }
    return hash.digest(encoding);
}

/** Exact bounded file inventory; symlinks and additional files cannot escape the snapshot. */
export async function artifactHashes(root: string): Promise<Record<string, string>> {
    const hashes: Record<string, string> = {};
    let visited = 0;
    async function visit(relative: string, depth: number): Promise<void> {
        if (++visited > 8192 || depth > 24) {
            throw new Error("Release artifact inventory exceeds its bounds");
        }
        const path = join(root, relative);
        const metadata = await lstat(path);
        if (metadata.isSymbolicLink()) {
            throw new Error(`Symbolic release artifact: ${relative}`);
        }
        if (metadata.isDirectory()) {
            for (const name of (await readdir(path)).sort()) {
                if (relative === "repository" && name === ".write-lock") {
                    continue;
                }
                await visit(`${relative}/${name}`, depth + 1);
            }
        } else {
            hashes[relative] = await fileHash(path);
        }
    }
    await visit("cli", 0);
    await visit("repository", 0);
    return hashes;
}
