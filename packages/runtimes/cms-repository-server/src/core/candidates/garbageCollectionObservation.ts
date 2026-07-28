import type { FsIntegrationRegistryCandidateGarbageCollectionResult } from "@bernouy/cms-integration-registry/fs";
import type { RepositoryCandidateGarbageCollectionLogEntry } from "../observability/contracts";

export function candidateGarbageCollectionObservation(
    trigger: "startup" | "periodic",
    timestamp: string,
    durationMs: number,
    result: FsIntegrationRegistryCandidateGarbageCollectionResult | undefined,
    error?: string,
): RepositoryCandidateGarbageCollectionLogEntry {
    return Object.freeze({
        schema: "cms.repository.candidate-garbage-collection.v1",
        timestamp,
        trigger,
        outcome: error ? "failed" : "succeeded",
        durationMs,
        ...(result
            ? {
                  removedObjects: result.removedObjects,
                  retainedReferencedObjects: result.retainedReferencedObjects,
                  retainedWithinGraceObjects: result.retainedWithinGraceObjects,
                  prunedCandidates: result.prunedCandidateIds.length,
                  removedAuditRecords: result.removedAuditRecords,
              }
            : {}),
        ...(error ? { errorCode: error } : {}),
    });
}

export function candidateGarbageCollectionElapsed(value: number): number {
    return Number.isFinite(value) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.round(value))) : 0;
}

export function candidateGarbageCollectionErrorCode(error: unknown): string {
    const code = error instanceof Error && "code" in error ? String(error.code) : "candidate_gc_failed";
    return /^[a-z0-9_-]{1,128}$/u.test(code) ? code : "candidate_gc_failed";
}
