import { chmod, lstat, rename } from "node:fs/promises";
import { dirname } from "node:path";
import type { IntegrationDefinitionIndex } from "@bernouy/cms-integrations";
import { IntegrationRegistryVersionConflictError } from "../../../../../core/publication/errors";
import { removeFileIfExists, replaceCanonicalJson, syncDirectory } from "../../persistence/canonicalFile";
import type { FsIntegrationRegistryPublicationPaths } from "../../persistence/layout";
import { removeImmutableTreeIfExists } from "../../persistence/tree";

const MAX_INDEX_DOCUMENT_BYTES = 2 * 1_024 * 1_024;

export type PublicationMutationState = {
    journalCreated: boolean;
    versionMoved: boolean;
    manifestWritten: boolean;
    reportWritten: boolean;
    indexWritten: boolean;
    snapshotSwapped: boolean;
};

export async function moveVersionLive(
    paths: FsIntegrationRegistryPublicationPaths,
    kind: string,
    version: string,
): Promise<void> {
    const stagingParent = await lstat(dirname(paths.stagingRoot));
    const versionsParent = await lstat(paths.versionsRoot);
    if (stagingParent.dev !== versionsParent.dev) {
        throw new Error("Integration registry staging and live version directories must share a filesystem");
    }
    await chmod(paths.stagingRoot, 0o750);
    try {
        await rename(paths.stagingRoot, paths.versionRoot);
    } catch (error) {
        await chmod(paths.stagingRoot, 0o550);
        if (isNodeError(error) && (error.code === "EEXIST" || error.code === "ENOTEMPTY")) {
            throw new IntegrationRegistryVersionConflictError(kind, version);
        }
        throw error;
    }
    await chmod(paths.versionRoot, 0o550);
    await syncDirectory(paths.versionsRoot);
    await syncDirectory(dirname(paths.stagingRoot));
}

export async function rollbackPublication(
    paths: FsIntegrationRegistryPublicationPaths,
    previousIndex: IntegrationDefinitionIndex | null,
    state: PublicationMutationState,
): Promise<void> {
    const failures: unknown[] = [];
    if (state.indexWritten) {
        await captureFailure(
            failures,
            previousIndex
                ? replaceCanonicalJson(paths.index, previousIndex, MAX_INDEX_DOCUMENT_BYTES)
                : removeFileIfExists(paths.index),
        );
    }
    if (state.reportWritten) {
        await captureFailure(failures, removeFileIfExists(paths.report));
    }
    if (state.manifestWritten) {
        await captureFailure(failures, removeFileIfExists(paths.manifest));
    }
    if (state.versionMoved) {
        await captureFailure(failures, removeImmutableTreeIfExists(paths.versionRoot));
    }
    await captureFailure(failures, removeImmutableTreeIfExists(paths.stagingRoot));
    if (state.journalCreated) {
        await captureFailure(failures, removeFileIfExists(paths.journal));
    }
    if (failures.length > 0) {
        throw new AggregateError(failures, "Integration registry publication rollback failed");
    }
}

export async function cleanupCommitted(paths: FsIntegrationRegistryPublicationPaths): Promise<void> {
    await Promise.allSettled([removeImmutableTreeIfExists(paths.stagingRoot), removeFileIfExists(paths.journal)]);
}

async function captureFailure(failures: unknown[], operation: Promise<void>): Promise<void> {
    try {
        await operation;
    } catch (error) {
        failures.push(error);
    }
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
    return value instanceof Error && "code" in value;
}
