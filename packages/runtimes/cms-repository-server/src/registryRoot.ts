import { constants } from "node:fs";
import { access, lstat, open, readdir, realpath, unlink } from "node:fs/promises";
import { join } from "node:path";

export const REPOSITORY_BOOTSTRAP_MARKER = ".official-bootstrap-in-progress";

export type PreparedEmptyRegistryBootstrap = Readonly<{
    commit(): Promise<void>;
}>;

export type EmptyRegistryBootstrap = (registryRoot: string) => Promise<PreparedEmptyRegistryBootstrap>;

export class RepositoryRegistryBootstrapIncompleteError extends Error {
    constructor() {
        super("Integration repository bootstrap is incomplete and requires operator recovery");
        this.name = "RepositoryRegistryBootstrapIncompleteError";
    }
}

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
    if (entries.includes(REPOSITORY_BOOTSTRAP_MARKER)) {
        throw new RepositoryRegistryBootstrapIncompleteError();
    }
    if (entries.length > 0) {
        return "already-initialized";
    }
    const prepared = await bootstrap(root);
    const entriesAfterPreparation = await readdir(root);
    if (entriesAfterPreparation.includes(REPOSITORY_BOOTSTRAP_MARKER)) {
        throw new RepositoryRegistryBootstrapIncompleteError();
    }
    if (entriesAfterPreparation.length > 0) {
        return "already-initialized";
    }
    await writeBootstrapMarker(root);
    await prepared.commit();
    await removeBootstrapMarker(root);
    return "bootstrapped";
}

async function writeBootstrapMarker(root: string): Promise<void> {
    const marker = await open(join(root, REPOSITORY_BOOTSTRAP_MARKER), "wx", 0o600);
    try {
        await marker.writeFile('{"schema":"cms.integration.repository.bootstrap.v1","state":"in-progress"}\n', "utf8");
        await marker.sync();
    } finally {
        await marker.close();
    }
    await syncDirectory(root);
}

async function removeBootstrapMarker(root: string): Promise<void> {
    await unlink(join(root, REPOSITORY_BOOTSTRAP_MARKER));
    await syncDirectory(root);
}

async function syncDirectory(path: string): Promise<void> {
    const directory = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try {
        await directory.sync();
    } finally {
        await directory.close();
    }
}
