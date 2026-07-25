import { constants } from "node:fs";
import { access, lstat, readdir, realpath } from "node:fs/promises";

export type EmptyRegistryBootstrap = (registryRoot: string) => Promise<void>;

export async function validateRepositoryRegistryRoot(root: string): Promise<void> {
    const stats = await lstat(root);
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
        throw new Error("CMS_REPOSITORY_REGISTRY_ROOT must be a non-symlink directory");
    }
    await realpath(root);
    await access(root, constants.R_OK | constants.W_OK);
}

export async function bootstrapRepositoryRegistryIfEmpty(
    root: string,
    bootstrap: EmptyRegistryBootstrap,
): Promise<"bootstrapped" | "already-initialized"> {
    await validateRepositoryRegistryRoot(root);
    const entries = await readdir(root);
    if (entries.length > 0) {
        return "already-initialized";
    }
    await bootstrap(root);
    return "bootstrapped";
}
