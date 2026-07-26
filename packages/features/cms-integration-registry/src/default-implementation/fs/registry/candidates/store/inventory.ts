import { readdir } from "node:fs/promises";
import { readVerifiedRegistryDirectory } from "../../persistence/ownedDirectory";
import { FsIntegrationRegistryCandidateStoreError } from "../errors";
import {
    FS_INTEGRATION_REGISTRY_CANDIDATE_INVENTORY_LIMIT,
    type FsIntegrationRegistryCandidateLayout,
} from "../layout";

export async function candidateRecordInventory(layout: FsIntegrationRegistryCandidateLayout) {
    await readVerifiedRegistryDirectory(layout.records);
    const entries = await readdir(layout.records, { withFileTypes: true });
    if (entries.length > FS_INTEGRATION_REGISTRY_CANDIDATE_INVENTORY_LIMIT) {
        throw new FsIntegrationRegistryCandidateStoreError(
            "inventory_limit",
            "Candidate inventory exceeds its configured limit",
        );
    }
    return entries.toSorted((left, right) => compareText(left.name, right.name));
}

export async function assertCandidateRecordCapacity(layout: FsIntegrationRegistryCandidateLayout): Promise<void> {
    if ((await candidateRecordInventory(layout)).length >= FS_INTEGRATION_REGISTRY_CANDIDATE_INVENTORY_LIMIT) {
        throw new FsIntegrationRegistryCandidateStoreError(
            "inventory_limit",
            "Candidate inventory reached its configured limit",
        );
    }
}

export function boundedCandidateListLimit(limit: number): void {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > FS_INTEGRATION_REGISTRY_CANDIDATE_INVENTORY_LIMIT) {
        throw new TypeError("Candidate claimable limit must be a positive bounded safe integer");
    }
}

export function canonicalCandidateStoreTimestamp(value: string): number {
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
        throw new TypeError("Candidate store time must be a canonical ISO timestamp");
    }
    return parsed;
}

function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}
