import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, rm } from "node:fs/promises";
import { join } from "node:path";
import { FilesystemRepositoryCatalogueIndex } from "@bernouy/cms-repository/repository/filesystem";

/** Fail startup before listening when the persistent repository cannot be trusted or written. */
export async function validateOfficialRepositoryStorage(
    root: string,
    index = new FilesystemRepositoryCatalogueIndex(root),
): Promise<void> {
    await mkdir(root, { recursive: true, mode: 0o700 });
    const metadata = await lstat(root);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
        throw new Error("ULVIA_REPOSITORY_DIR must be a real directory, not a symbolic link");
    }
    const probe = join(root, `.startup-${randomUUID()}.probe`);
    const handle = await open(probe, "wx", 0o600);
    try {
        await handle.writeFile("repository startup probe");
        await handle.sync();
    } finally {
        await handle.close();
        await rm(probe, { force: true });
    }

    await index.refresh();
}
