import { lstat } from "node:fs/promises";
import { resolve } from "node:path";

export const REPOSITORY_ROOT = resolve(import.meta.dir, "../../..");

async function exists(path: string): Promise<boolean> {
    try {
        await lstat(path);
        return true;
    } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
        throw error;
    }
}

export async function listCurrentRepositoryPaths(repositoryRoot = REPOSITORY_ROOT): Promise<string[]> {
    const result = Bun.spawnSync(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        { cwd: repositoryRoot, stdout: "pipe", stderr: "pipe" },
    );
    if (result.exitCode !== 0) {
        const details = result.stderr.toString().trim();
        throw new Error(`Cannot list current repository files${details ? `: ${details}` : ""}`);
    }
    const paths = result.stdout.toString().split("\0").filter(Boolean);
    const present = await Promise.all(
        paths.map(async (path) => ((await exists(resolve(repositoryRoot, path))) ? path : undefined)),
    );
    return present.filter((path): path is string => path !== undefined).sort();
}
