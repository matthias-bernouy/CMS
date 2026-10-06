import { randomUUID } from "node:crypto";
import { cp, lstat, mkdir, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { FilesystemRepositoryCatalogueIndex } from "@bernouy/cms-repository/repository/filesystem";

/** Atomically installs a pre-admitted repository snapshot only when no repository exists. */
export async function seedOfficialRepository(root: string, seedRoot?: string): Promise<void> {
    if (!seedRoot || (await exists(root))) {
        return;
    }
    const seedMetadata = await lstat(seedRoot);
    if (!seedMetadata.isDirectory() || seedMetadata.isSymbolicLink()) {
        throw new Error("ULVIA_REPOSITORY_SEED_DIR must be a real directory");
    }
    const parent = dirname(root);
    await mkdir(parent, { recursive: true, mode: 0o700 });
    const staging = join(parent, `.repository-seed-${randomUUID()}`);
    try {
        await cp(seedRoot, staging, { recursive: true, errorOnExist: true, force: false });
        await new FilesystemRepositoryCatalogueIndex(staging).refresh();
        try {
            await rename(staging, root);
        } catch (error) {
            if (!(await exists(root))) {
                throw error;
            }
        }
    } finally {
        await rm(staging, { recursive: true, force: true });
    }
}

async function exists(path: string): Promise<boolean> {
    try {
        await lstat(path);
        return true;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return false;
        }
        throw error;
    }
}
