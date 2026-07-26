import { mkdir, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { readVerifiedRegistryDirectory } from "../../persistence/ownedDirectory";
import { syncDirectory } from "../../persistence/canonicalFile";
import { FsIntegrationRegistryCandidateStoreError } from "../errors";
import type { FsIntegrationRegistryCandidateLayout } from "../layout";

const LOCK_NAME = ".mutation-lock";
const DEFAULT_LOCK_TIMEOUT_MS = 5_000;

export function candidateMutationLockPath(layout: FsIntegrationRegistryCandidateLayout): string {
    return join(layout.root, LOCK_NAME);
}

export async function withCandidateMutationLock<T>(
    layout: FsIntegrationRegistryCandidateLayout,
    action: () => Promise<T>,
    timeoutMs = DEFAULT_LOCK_TIMEOUT_MS,
): Promise<T> {
    const path = candidateMutationLockPath(layout);
    const deadline = Date.now() + timeoutMs;
    await readVerifiedRegistryDirectory(layout.root);
    while (true) {
        try {
            await mkdir(path, { mode: 0o700 });
            await syncDirectory(layout.root);
            break;
        } catch (error) {
            if (!isNodeError(error) || error.code !== "EEXIST") {
                throw error;
            }
            if (Date.now() >= deadline) {
                throw new FsIntegrationRegistryCandidateStoreError(
                    "mutation_locked",
                    "Candidate mutations are locked by another process or require recovery after a crash",
                );
            }
            await new Promise<void>((resolve) => setTimeout(resolve, 5));
        }
    }
    try {
        return await action();
    } finally {
        await rmdir(path);
        await syncDirectory(layout.root);
    }
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
    return value instanceof Error && "code" in value;
}
