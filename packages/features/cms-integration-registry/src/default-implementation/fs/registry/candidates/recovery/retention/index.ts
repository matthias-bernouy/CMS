import { readdir, rename, rm, unlink } from "node:fs/promises";
import { join } from "node:path";
import { syncDirectory } from "../../../persistence/canonicalFile";
import { readVerifiedRegistryDirectory } from "../../../persistence/ownedDirectory";
import { readPersistedIntegrationRegistryCandidateRecord } from "../../document";
import { FsIntegrationRegistryCandidateStoreError } from "../../errors";
import { readCurrentCandidateRecord } from "../../history";
import {
    candidateRecordRoot,
    candidateRevisionPath,
    FS_INTEGRATION_REGISTRY_CANDIDATE_GLOBAL_OBJECT_LIMIT,
    FS_INTEGRATION_REGISTRY_CANDIDATE_INVENTORY_LIMIT,
    type FsIntegrationRegistryCandidateLayout,
} from "../../layout";
import { readFsIntegrationRegistryCandidateObjects } from "../../objects";
import { readPrunedCandidate, writeOrVerifyPrunedCandidate } from "./document";

const REVISION_FILE = /^(\d{16})\.json$/u;
const AUDIT_FILE = /^([A-Za-z0-9][A-Za-z0-9._-]{0,127})\.json$/u;

export type CandidateRetentionResult = Readonly<{
    prunedCandidateIds: readonly string[];
    removedAuditRecords: number;
}>;

export async function recoverInterruptedCandidatePruning(layout: FsIntegrationRegistryCandidateLayout): Promise<void> {
    await resumeInterruptedPruning(layout);
}

export async function pruneTerminalCandidateRecords(
    layout: FsIntegrationRegistryCandidateLayout,
    now: string,
    terminalGraceMs: number,
    auditRetentionMs: number,
): Promise<CandidateRetentionResult> {
    await resumeInterruptedPruning(layout);
    const removedAuditRecords = await removeExpiredAudits(layout, now, auditRetentionMs);
    const auditIds = new Set(
        (await readdir(layout.pruned)).map((name) => {
            const match = AUDIT_FILE.exec(name);
            if (!match) {
                corrupt(`Candidate prune audit inventory contains unsafe entry ${name}`);
            }
            return match[1]!;
        }),
    );
    const prunedCandidateIds: string[] = [];
    for (const entry of await boundedEntries(layout.records)) {
        if (!entry.isDirectory() || entry.isSymbolicLink()) {
            corrupt(`Candidate inventory contains unsafe entry ${entry.name}`);
        }
        const lastDocument = await readLastPersistedRecord(layout, entry.name);
        if (!lastDocument || lastDocument.schema === "cms.integration.registry.candidate-record.v1") {
            continue;
        }
        const record = await readCurrentCandidateRecord(layout, entry.name);
        if (!record || !new Set(["published", "rejected", "expired"]).has(record.status)) {
            continue;
        }
        if (Date.parse(now) - Date.parse(record.updatedAt) < terminalGraceMs) {
            continue;
        }
        await readFsIntegrationRegistryCandidateObjects(layout, record);
        const auditPath = join(layout.pruned, `${record.candidateId}.json`);
        if (!auditIds.has(record.candidateId) && auditIds.size >= FS_INTEGRATION_REGISTRY_CANDIDATE_INVENTORY_LIMIT) {
            throw new FsIntegrationRegistryCandidateStoreError(
                "inventory_limit",
                "Candidate prune audit inventory reached its configured limit",
            );
        }
        await writeOrVerifyPrunedCandidate(auditPath, record, now);
        auditIds.add(record.candidateId);
        const source = candidateRecordRoot(layout, record.candidateId);
        const destination = join(layout.pruning, record.candidateId);
        await rename(source, destination);
        await syncDirectory(layout.records);
        await syncDirectory(layout.pruning);
        await removeVerifiedPruningDirectory(layout, record.candidateId);
        prunedCandidateIds.push(record.candidateId);
    }
    return Object.freeze({ prunedCandidateIds: Object.freeze(prunedCandidateIds), removedAuditRecords });
}

async function resumeInterruptedPruning(layout: FsIntegrationRegistryCandidateLayout): Promise<void> {
    for (const entry of await boundedEntries(layout.pruning)) {
        if (!entry.isDirectory() || entry.isSymbolicLink()) {
            corrupt(`Candidate pruning inventory contains unsafe entry ${entry.name}`);
        }
        if (!(await readPrunedCandidate(join(layout.pruned, `${entry.name}.json`)))) {
            corrupt(`Candidate pruning entry ${entry.name} has no durable audit record`);
        }
        await removeVerifiedPruningDirectory(layout, entry.name);
    }
}

async function removeExpiredAudits(
    layout: FsIntegrationRegistryCandidateLayout,
    now: string,
    retentionMs: number,
): Promise<number> {
    let removed = 0;
    for (const entry of await boundedEntries(layout.pruned, FS_INTEGRATION_REGISTRY_CANDIDATE_GLOBAL_OBJECT_LIMIT)) {
        const match = AUDIT_FILE.exec(entry.name);
        if (!match || !entry.isFile() || entry.isSymbolicLink()) {
            corrupt(`Candidate prune audit inventory contains unsafe entry ${entry.name}`);
        }
        const path = join(layout.pruned, entry.name);
        const audit = await readPrunedCandidate(path);
        if (!audit || audit.candidateId !== match[1]) {
            corrupt(`Candidate prune audit ${entry.name} has inconsistent identity`);
        }
        if (Date.parse(now) - Date.parse(audit.prunedAt) >= retentionMs) {
            await unlink(path);
            await syncDirectory(layout.pruned);
            removed += 1;
        }
    }
    return removed;
}

async function readLastPersistedRecord(layout: FsIntegrationRegistryCandidateLayout, candidateId: string) {
    const entries = await boundedEntries(candidateRecordRoot(layout, candidateId));
    const revisions = entries
        .map((entry) => {
            const match = REVISION_FILE.exec(entry.name);
            if (!match || !entry.isFile() || entry.isSymbolicLink()) {
                corrupt(`Candidate ${candidateId} contains an unsafe revision entry ${entry.name}`);
            }
            return Number(match[1]);
        })
        .toSorted((left, right) => left - right);
    const revision = revisions.at(-1);
    return revision === undefined
        ? null
        : await readPersistedIntegrationRegistryCandidateRecord(candidateRevisionPath(layout, candidateId, revision));
}

async function removeVerifiedPruningDirectory(
    layout: FsIntegrationRegistryCandidateLayout,
    candidateId: string,
): Promise<void> {
    const path = join(layout.pruning, candidateId);
    await readVerifiedRegistryDirectory(path);
    await rm(path, { recursive: true });
    await syncDirectory(layout.pruning);
}

async function boundedEntries(root: string, limit = FS_INTEGRATION_REGISTRY_CANDIDATE_INVENTORY_LIMIT) {
    await readVerifiedRegistryDirectory(root);
    const entries = await readdir(root, { withFileTypes: true });
    if (entries.length > limit) {
        throw new FsIntegrationRegistryCandidateStoreError(
            "inventory_limit",
            `Candidate retention inventory ${root} exceeds its configured limit`,
        );
    }
    return entries.toSorted((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
}

function corrupt(message: string): never {
    throw new FsIntegrationRegistryCandidateStoreError("corrupt_candidate", message);
}

export {
    PRUNED_INTEGRATION_REGISTRY_CANDIDATE_DOCUMENT_LIMIT,
    PRUNED_INTEGRATION_REGISTRY_CANDIDATE_SCHEMA,
    readPrunedCandidate,
    type PrunedIntegrationRegistryCandidateRecord,
} from "./document";
