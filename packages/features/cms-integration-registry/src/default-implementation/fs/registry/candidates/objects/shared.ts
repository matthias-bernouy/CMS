import { lstat, readdir } from "node:fs/promises";
import { dirname } from "node:path";
import { writeCanonicalJsonNoReplace } from "../../persistence/canonicalFile";
import { readVerifiedRegistryDirectory } from "../../persistence/ownedDirectory";
import { FsIntegrationRegistryCandidateStoreError } from "../errors";
import {
    FS_INTEGRATION_REGISTRY_CANDIDATE_GLOBAL_OBJECT_LIMIT,
    FS_INTEGRATION_REGISTRY_CANDIDATE_INVENTORY_LIMIT,
    type FsIntegrationRegistryCandidateLayout,
} from "../layout";

export async function writeOrVerifyObject<T>(
    layout: FsIntegrationRegistryCandidateLayout,
    root: string,
    path: string,
    value: T,
    maxBytes: number,
    readExisting: () => Promise<unknown>,
): Promise<void> {
    await assertCandidateObjectCapacity(layout, path);
    try {
        await writeCanonicalJsonNoReplace(path, value, maxBytes);
    } catch (error) {
        if (!isNodeError(error) || error.code !== "EEXIST") {
            throw error;
        }
        await readExisting();
        return;
    }
    await readVerifiedRegistryDirectory(root);
}

export async function assertCandidateObjectCapacity(
    layout: FsIntegrationRegistryCandidateLayout,
    justWrittenPath?: string,
): Promise<void> {
    let total = 0;
    for (const root of [
        layout.packages,
        layout.verifications,
        layout.policies,
        layout.admissions,
        layout.compatibilityReports,
        layout.statefulSelections,
        layout.migrationInputs,
        layout.results,
    ]) {
        await readVerifiedRegistryDirectory(root);
        const entries = await readdir(root);
        if (
            entries.length > FS_INTEGRATION_REGISTRY_CANDIDATE_INVENTORY_LIMIT ||
            (entries.length === FS_INTEGRATION_REGISTRY_CANDIDATE_INVENTORY_LIMIT &&
                justWrittenPath !== undefined &&
                dirname(justWrittenPath) === root &&
                !(await isExistingFile(justWrittenPath)))
        ) {
            limit(`Candidate object inventory ${root} exceeds its configured limit`);
        }
        total += entries.length;
    }
    if (total >= FS_INTEGRATION_REGISTRY_CANDIDATE_GLOBAL_OBJECT_LIMIT && !(await isExistingFile(justWrittenPath))) {
        limit("Candidate global object inventory exceeds its configured limit");
    }
}

async function isExistingFile(path: string | undefined): Promise<boolean> {
    if (!path) {
        return false;
    }
    try {
        return (await lstat(path)).isFile();
    } catch (error) {
        if (isNodeError(error) && error.code === "ENOENT") {
            return false;
        }
        throw error;
    }
}

export function corrupt(message: string): never {
    throw new FsIntegrationRegistryCandidateStoreError("corrupt_candidate", message);
}

function limit(message: string): never {
    throw new FsIntegrationRegistryCandidateStoreError("inventory_limit", message);
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
    return value instanceof Error && "code" in value;
}
