import { randomUUID } from "node:crypto";
import { cp, lstat, mkdir, readdir, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { FilesystemRepositoryCatalogueIndex } from "@bernouy/cms-repository/repository/filesystem";

/** Installs a pre-admitted snapshot only into absent or empty repository storage. */
export async function seedOfficialRepository(root: string, seedRoot?: string): Promise<void> {
    if (!seedRoot) {
        return;
    }
    const seedMetadata = await lstat(seedRoot);
    if (!seedMetadata.isDirectory() || seedMetadata.isSymbolicLink()) {
        throw new Error("ULVIA_REPOSITORY_SEED_DIR must be a real directory");
    }
    const rootExists = await exists(root);
    if (rootExists) {
        const rootMetadata = await lstat(root);
        if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) {
            throw new Error("ULVIA_REPOSITORY_DIR must be a real directory");
        }
        if ((await readdir(root)).some((name) => name !== ".server-lock")) {
            return;
        }
    }
    const parent = rootExists ? root : dirname(root);
    await mkdir(parent, { recursive: true, mode: 0o700 });
    const staging = join(parent, `.repository-seed-${randomUUID()}`);
    try {
        await cp(seedRoot, staging, { recursive: true, errorOnExist: true, force: false });
        await new FilesystemRepositoryCatalogueIndex(staging).refresh();
        if (!rootExists) {
            await rename(staging, root);
            return;
        }
        const installed: string[] = [];
        try {
            for (const entry of await readdir(staging)) {
                await rename(join(staging, entry), join(root, entry));
                installed.push(entry);
            }
        } catch (error) {
            await Promise.all(installed.map((entry) => rm(join(root, entry), { recursive: true, force: true })));
            throw error;
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
