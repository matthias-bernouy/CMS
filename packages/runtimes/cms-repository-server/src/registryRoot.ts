import { constants } from "node:fs";
import { access, lstat, realpath } from "node:fs/promises";

export async function validateRepositoryRegistryRoot(root: string): Promise<void> {
    const stats = await lstat(root);
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
        throw new Error("CMS_REPOSITORY_REGISTRY_ROOT must be a non-symlink directory");
    }
    await realpath(root);
    await access(root, constants.R_OK | constants.W_OK);
}
