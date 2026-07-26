import { ensureFsIntegrationRegistryCandidateLayout } from "../../layout";
import { withCandidateMutationLock } from "../../store/lock";
import { collectCandidateObjectReferences } from "./references";
import { sweepCandidateObjects } from "./sweep";
import { pruneTerminalCandidateRecords } from "../retention";

export type GarbageCollectFsIntegrationRegistryCandidateObjectsConfig = Readonly<{
    root: string;
    now: string;
    gracePeriodMs: number;
    terminalRecordGracePeriodMs?: number;
    auditRetentionMs?: number;
}>;

export type FsIntegrationRegistryCandidateGarbageCollectionResult = Readonly<{
    removedObjects: number;
    retainedReferencedObjects: number;
    retainedWithinGraceObjects: number;
    prunedCandidateIds: readonly string[];
    removedAuditRecords: number;
}>;

const DEFAULT_TERMINAL_RECORD_GRACE_MS = 7 * 24 * 60 * 60 * 1_000;
const DEFAULT_AUDIT_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

export async function garbageCollectFsIntegrationRegistryCandidateObjects(
    config: GarbageCollectFsIntegrationRegistryCandidateObjectsConfig,
): Promise<FsIntegrationRegistryCandidateGarbageCollectionResult> {
    const now = canonicalTimestamp(config.now);
    assertDuration(config.gracePeriodMs, "object garbage collection grace", true);
    const terminalGrace = config.terminalRecordGracePeriodMs ?? DEFAULT_TERMINAL_RECORD_GRACE_MS;
    const auditRetention = config.auditRetentionMs ?? DEFAULT_AUDIT_RETENTION_MS;
    assertDuration(terminalGrace, "terminal record grace", true);
    assertDuration(auditRetention, "prune audit retention", false);
    const layout = await ensureFsIntegrationRegistryCandidateLayout(config.root);
    return await withCandidateMutationLock(layout, async () => {
        const retention = await pruneTerminalCandidateRecords(layout, config.now, terminalGrace, auditRetention);
        const sweep = await sweepCandidateObjects(
            layout,
            await collectCandidateObjectReferences(layout),
            now,
            config.gracePeriodMs,
        );
        return Object.freeze({
            ...sweep,
            prunedCandidateIds: retention.prunedCandidateIds,
            removedAuditRecords: retention.removedAuditRecords,
        });
    });
}

function canonicalTimestamp(value: string): number {
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
        throw new TypeError("Candidate garbage collection time must be a canonical ISO timestamp");
    }
    return parsed;
}

function assertDuration(value: number, label: string, allowZero: boolean): void {
    if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) {
        throw new TypeError(`Candidate ${label} must be a ${allowZero ? "non-negative" : "positive"} safe integer`);
    }
}
