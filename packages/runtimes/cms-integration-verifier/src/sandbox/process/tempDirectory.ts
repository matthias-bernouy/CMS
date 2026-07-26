import { chmod, lstat, mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ProcessVerificationSandboxError } from "./types";

export async function createIsolatedTempDirectory(tempRoot: string): Promise<string> {
    const root = await secureTempRoot(tempRoot);
    const directory = await mkdtemp(join(root, "job-"));
    await chmod(directory, 0o700);
    return directory;
}

export async function removeIsolatedTempDirectory(directory: string): Promise<void> {
    await rm(directory, { recursive: true, force: true });
}

async function secureTempRoot(path: string): Promise<string> {
    const expected = resolve(path);
    await mkdir(expected, { recursive: true, mode: 0o700 });
    const stats = await lstat(expected);
    const actual = await realpath(expected);
    if (!stats.isDirectory() || stats.isSymbolicLink() || actual !== expected) {
        throw new ProcessVerificationSandboxError("launch-failed");
    }
    await chmod(expected, 0o700);
    return actual;
}
