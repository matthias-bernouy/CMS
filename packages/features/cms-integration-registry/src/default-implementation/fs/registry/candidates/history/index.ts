import { readdir } from "node:fs/promises";
import { IntegrationRegistryCandidateError } from "cms-integration-registry/core/publication/candidates/errors";
import type { IntegrationRegistryCandidateRecord } from "cms-integration-registry/interfaces/publication";
import { writeCanonicalJsonNoReplace } from "../../persistence/canonicalFile";
import { ensureVerifiedRegistryChildDirectory, readVerifiedRegistryDirectory } from "../../persistence/ownedDirectory";
import { readIntegrationRegistryCandidateRecord } from "../document";
import { FsIntegrationRegistryCandidateStoreError } from "../errors";
import {
    candidateRecordRoot,
    candidateRevisionPath,
    FS_INTEGRATION_REGISTRY_CANDIDATE_DOCUMENT_LIMIT,
    FS_INTEGRATION_REGISTRY_CANDIDATE_INVENTORY_LIMIT,
    type FsIntegrationRegistryCandidateLayout,
} from "../layout";
import { assertCandidateRecordFollows, assertInitialCandidateRecord } from "./transition";

const REVISION_FILE = /^(\d{16})\.json$/u;
const TEMPORARY_FILE = /^\.[0-9a-f-]{36}\.tmp$/u;

export async function readCurrentCandidateRecord(
    layout: FsIntegrationRegistryCandidateLayout,
    candidateId: string,
): Promise<IntegrationRegistryCandidateRecord | null> {
    const records = await readCandidateRecordHistory(layout, candidateId);
    return records.at(-1) ?? null;
}

export async function readCandidateRecordHistory(
    layout: FsIntegrationRegistryCandidateLayout,
    candidateId: string,
): Promise<readonly IntegrationRegistryCandidateRecord[]> {
    const root = candidateRecordRoot(layout, candidateId);
    try {
        await readVerifiedRegistryDirectory(root);
    } catch (error) {
        if (isNodeError(error) && error.code === "ENOENT") {
            return [];
        }
        throw error;
    }
    const entries = await readdir(root, { withFileTypes: true });
    if (entries.length > FS_INTEGRATION_REGISTRY_CANDIDATE_INVENTORY_LIMIT) {
        throw new FsIntegrationRegistryCandidateStoreError(
            "inventory_limit",
            `Candidate ${candidateId} revision inventory exceeds its limit`,
        );
    }
    const revisions = entries
        .filter((entry) => !TEMPORARY_FILE.test(entry.name))
        .map((entry) => parseRevisionEntry(candidateId, entry))
        .toSorted((left, right) => left - right);
    const records: IntegrationRegistryCandidateRecord[] = [];
    for (const [index, revision] of revisions.entries()) {
        if (revision !== index) {
            corrupt(`Candidate ${candidateId} has a missing or non-contiguous revision`);
        }
        const record = await readIntegrationRegistryCandidateRecord(
            candidateRevisionPath(layout, candidateId, revision),
        );
        if (!record || record.candidateId !== candidateId || record.revision !== revision) {
            corrupt(`Candidate ${candidateId} revision ${revision} has inconsistent identity`);
        }
        if (index === 0) {
            assertInitialCandidateRecord(record);
        } else {
            assertCandidateRecordFollows(records[index - 1]!, record);
        }
        records.push(record);
    }
    await readVerifiedRegistryDirectory(root);
    return Object.freeze(records);
}

export async function appendCandidateRecordRevision(
    layout: FsIntegrationRegistryCandidateLayout,
    record: IntegrationRegistryCandidateRecord,
): Promise<void> {
    if (record.revision >= FS_INTEGRATION_REGISTRY_CANDIDATE_INVENTORY_LIMIT) {
        throw new FsIntegrationRegistryCandidateStoreError(
            "inventory_limit",
            `Candidate ${record.candidateId} revision inventory reached its limit`,
        );
    }
    const current = await readCurrentCandidateRecord(layout, record.candidateId);
    if (record.revision === 0) {
        if (current) {
            candidateExists(record.candidateId);
        }
        await ensureVerifiedRegistryChildDirectory(layout.records, record.candidateId);
    } else {
        if (!current) {
            throw new FsIntegrationRegistryCandidateStoreError(
                "candidate_not_found",
                `Candidate ${record.candidateId} does not exist`,
            );
        }
        if (current.revision !== record.revision - 1) {
            revisionConflict(record.revision - 1, current.revision);
        }
        assertCandidateRecordFollows(current, record);
    }
    try {
        await writeCanonicalJsonNoReplace(
            candidateRevisionPath(layout, record.candidateId, record.revision),
            record,
            FS_INTEGRATION_REGISTRY_CANDIDATE_DOCUMENT_LIMIT,
        );
    } catch (error) {
        if (isNodeError(error) && error.code === "EEXIST") {
            if (record.revision === 0) {
                candidateExists(record.candidateId);
            }
            revisionConflict(record.revision - 1, record.revision);
        }
        throw error;
    }
}

function parseRevisionEntry(candidateId: string, entry: Readonly<{ name: string; isFile(): boolean }>): number {
    const match = REVISION_FILE.exec(entry.name);
    if (!match || !entry.isFile()) {
        corrupt(`Candidate ${candidateId} contains unexpected revision entry ${entry.name}`);
    }
    const revision = Number(match[1]);
    if (!Number.isSafeInteger(revision)) {
        corrupt(`Candidate ${candidateId} contains an unsafe revision number`);
    }
    return revision;
}

function candidateExists(candidateId: string): never {
    throw new FsIntegrationRegistryCandidateStoreError("candidate_exists", `Candidate ${candidateId} already exists`);
}

function revisionConflict(expected: number, actual: number): never {
    throw new IntegrationRegistryCandidateError(
        "revision_conflict",
        `Candidate revision changed from expected ${expected} to ${actual}`,
    );
}

function corrupt(message: string): never {
    throw new FsIntegrationRegistryCandidateStoreError("corrupt_candidate", message);
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
    return value instanceof Error && "code" in value;
}
