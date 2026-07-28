import { constants } from "node:fs";
import { access, lstat, readdir, realpath } from "node:fs/promises";
import {
    assertBootstrapPlanDigest,
    readRepositoryBootstrapMarker,
    removeRepositoryBootstrapMarker,
    REPOSITORY_BOOTSTRAP_MARKER,
    RepositoryRegistryBootstrapIncompleteError,
    writeRepositoryBootstrapMarker,
} from "./core/bootstrapMarker";

export { REPOSITORY_BOOTSTRAP_MARKER, RepositoryRegistryBootstrapIncompleteError } from "./core/bootstrapMarker";

export type PreparedEmptyRegistryBootstrap = Readonly<{
    planDigest: string;
    commit(): Promise<void>;
}>;

export type EmptyRegistryBootstrap = (registryRoot: string) => Promise<PreparedEmptyRegistryBootstrap>;

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
        return await resumeRepositoryBootstrap(root, bootstrap);
    }
    if (entries.length > 0) {
        return "already-initialized";
    }
    const prepared = await bootstrap(root);
    assertPreparedBootstrap(prepared);
    const entriesAfterPreparation = await readdir(root);
    if (entriesAfterPreparation.includes(REPOSITORY_BOOTSTRAP_MARKER)) {
        throw new RepositoryRegistryBootstrapIncompleteError();
    }
    if (entriesAfterPreparation.length > 0) {
        return "already-initialized";
    }
    await writeRepositoryBootstrapMarker(root, prepared.planDigest);
    await prepared.commit();
    await removeRepositoryBootstrapMarker(root, prepared.planDigest);
    return "bootstrapped";
}

async function resumeRepositoryBootstrap(root: string, bootstrap: EmptyRegistryBootstrap): Promise<"bootstrapped"> {
    const marker = await readRepositoryBootstrapMarker(root);
    const prepared = await bootstrap(root);
    assertPreparedBootstrap(prepared);
    if (prepared.planDigest !== marker.planDigest) {
        throw new RepositoryRegistryBootstrapIncompleteError();
    }
    await prepared.commit();
    await removeRepositoryBootstrapMarker(root, prepared.planDigest);
    return "bootstrapped";
}

function assertPreparedBootstrap(prepared: PreparedEmptyRegistryBootstrap): void {
    assertBootstrapPlanDigest(prepared.planDigest);
    if (typeof prepared.commit !== "function") {
        throw new TypeError("Integration repository bootstrap preparation is invalid");
    }
}
