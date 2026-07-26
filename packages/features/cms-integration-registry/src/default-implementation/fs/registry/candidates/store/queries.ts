import { IntegrationRegistryCandidateError } from "cms-integration-registry/core/publication/candidates/errors";
import type { IntegrationRegistryCandidateRecord } from "cms-integration-registry/interfaces/publication";
import { FsIntegrationRegistryCandidateStoreError } from "../errors";
import { assertCandidateId, type FsIntegrationRegistryCandidateLayout } from "../layout";
import { boundedCandidateListLimit, candidateRecordInventory, canonicalCandidateStoreTimestamp } from "./inventory";
import { requireCandidateRecord } from "./operations";

export async function readCandidateRecordOrNull(
    layout: FsIntegrationRegistryCandidateLayout,
    candidateId: string,
): Promise<IntegrationRegistryCandidateRecord | null> {
    try {
        return await requireCandidateRecord(layout, candidateId);
    } catch (error) {
        if (error instanceof FsIntegrationRegistryCandidateStoreError && error.code === "candidate_not_found") {
            return null;
        }
        throw error;
    }
}

export async function listClaimableCandidateRecords(
    layout: FsIntegrationRegistryCandidateLayout,
    now: string,
    limit: number,
    read: (candidateId: string) => Promise<IntegrationRegistryCandidateRecord | null>,
): Promise<readonly IntegrationRegistryCandidateRecord[]> {
    const currentTime = canonicalCandidateStoreTimestamp(now);
    boundedCandidateListLimit(limit);
    const result: IntegrationRegistryCandidateRecord[] = [];
    for (const entry of await candidateRecordInventory(layout)) {
        assertInventoryEntry(entry);
        const record = await read(entry.name);
        if (record?.status === "queued" && currentTime < Date.parse(record.expiresAt)) {
            result.push(record);
            if (result.length === limit) {
                break;
            }
        }
    }
    return Object.freeze(result);
}

export async function sweepExpiredCandidateLeases(
    layout: FsIntegrationRegistryCandidateLayout,
    now: string,
    limit: number,
    read: (candidateId: string) => Promise<IntegrationRegistryCandidateRecord | null>,
    recover: (
        candidateId: string,
        input: Readonly<{ expectedRevision: number; now: string }>,
    ) => Promise<IntegrationRegistryCandidateRecord>,
): Promise<readonly IntegrationRegistryCandidateRecord[]> {
    canonicalCandidateStoreTimestamp(now);
    boundedCandidateListLimit(limit);
    const recovered: IntegrationRegistryCandidateRecord[] = [];
    for (const entry of await candidateRecordInventory(layout)) {
        assertInventoryEntry(entry);
        const record = await read(entry.name);
        if (
            record?.status !== "running" ||
            !record.lease ||
            Date.parse(now) < Date.parse(record.lease.leaseExpiresAt)
        ) {
            continue;
        }
        try {
            recovered.push(await recover(entry.name, { expectedRevision: record.revision, now }));
        } catch (error) {
            if (!(error instanceof IntegrationRegistryCandidateError) || error.code !== "revision_conflict") {
                throw error;
            }
        }
        if (recovered.length === limit) {
            break;
        }
    }
    return Object.freeze(recovered);
}

export async function sweepDueCandidateExpirations(
    layout: FsIntegrationRegistryCandidateLayout,
    now: string,
    limit: number,
    read: (candidateId: string) => Promise<IntegrationRegistryCandidateRecord | null>,
    expire: (candidateId: string, expectedRevision: number, now: string) => Promise<IntegrationRegistryCandidateRecord>,
): Promise<readonly IntegrationRegistryCandidateRecord[]> {
    const currentTime = canonicalCandidateStoreTimestamp(now);
    boundedCandidateListLimit(limit);
    const expired: IntegrationRegistryCandidateRecord[] = [];
    for (const entry of await candidateRecordInventory(layout)) {
        assertInventoryEntry(entry);
        const record = await read(entry.name);
        if (
            !record ||
            (record.status !== "uploaded" && record.status !== "validating" && record.status !== "queued") ||
            currentTime < Date.parse(record.expiresAt)
        ) {
            continue;
        }
        try {
            expired.push(await expire(entry.name, record.revision, now));
        } catch (error) {
            if (!(error instanceof IntegrationRegistryCandidateError) || error.code !== "revision_conflict") {
                throw error;
            }
        }
        if (expired.length === limit) {
            break;
        }
    }
    return Object.freeze(expired);
}

function assertInventoryEntry(entry: Readonly<{ name: string; isDirectory(): boolean; isSymbolicLink(): boolean }>) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
        throw new FsIntegrationRegistryCandidateStoreError(
            "corrupt_candidate",
            `Candidate inventory contains unexpected entry ${entry.name}`,
        );
    }
    assertCandidateId(entry.name);
}
