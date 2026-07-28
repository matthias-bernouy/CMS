import { mkdtempSync, readdirSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ValidatedIntegrationCandidateEnvelopeV1 } from "@bernouy/cms-integration-verification";
import { FsIntegrationRegistryCandidateStore } from "@bernouy/cms-integration-registry/fs";
import { candidateAdmission, candidatePolicy } from "./admission";
import { candidateValue } from "./candidate";

export const CANDIDATE_TIMES = Object.freeze({
    created: "2026-07-26T10:00:00.000Z",
    validating: "2026-07-26T10:01:00.000Z",
    queued: "2026-07-26T10:02:00.000Z",
    claimed: "2026-07-26T10:03:00.000Z",
    lease: "2026-07-26T10:05:00.000Z",
    completed: "2026-07-26T10:04:00.000Z",
    expiredLease: "2026-07-26T10:05:01.000Z",
    expires: "2026-07-27T10:00:00.000Z",
} as const);

export type CandidateStoreFixture = Readonly<{
    root: string;
    store: FsIntegrationRegistryCandidateStore;
    candidate: ValidatedIntegrationCandidateEnvelopeV1;
    cleanup(): void;
}>;

export type CreatedCandidateStoreFixture = CandidateStoreFixture & Readonly<{ candidateId: string; expiresAt: string }>;

export async function candidateStoreFixture(
    candidateId = "candidate-1",
    expiresAt = CANDIDATE_TIMES.expires,
): Promise<CreatedCandidateStoreFixture> {
    const root = mkdtempSync(join(tmpdir(), "cms-integration-candidates-"));
    const candidate = await candidateValue();
    return {
        root,
        candidateId,
        expiresAt,
        store: new FsIntegrationRegistryCandidateStore({ root }),
        candidate,
        cleanup: () => rmSync(root, { recursive: true, force: true }),
    };
}

export async function createCandidate(fixture: CreatedCandidateStoreFixture, submittedBy?: string) {
    return await fixture.store.create({
        candidateId: fixture.candidateId,
        ...(submittedBy ? { submittedBy } : {}),
        candidate: fixture.candidate,
        createdAt: CANDIDATE_TIMES.created,
        expiresAt: fixture.expiresAt,
    });
}

export async function queueCandidate(fixture: CreatedCandidateStoreFixture, submittedBy?: string) {
    const uploaded = await createCandidate(fixture, submittedBy);
    const validating = await fixture.store.advanceValidation(fixture.candidateId, {
        expectedRevision: uploaded.revision,
        now: CANDIDATE_TIMES.validating,
    });
    const policy = await candidatePolicy();
    return await fixture.store.queue(fixture.candidateId, {
        expectedRevision: validating.revision,
        now: CANDIDATE_TIMES.queued,
        policy,
        admission: await candidateAdmission(fixture, policy),
    });
}

export async function expiredCandidate(candidateId: string) {
    const fixture = await candidateStoreFixture(candidateId, "2026-07-26T10:02:00.000Z");
    const uploaded = await createCandidate(fixture, "admin@example.com");
    await fixture.store.expire(fixture.candidateId, uploaded.revision, "2026-07-26T10:02:00.000Z");
    return fixture;
}

export function backdateCandidateObjects(root: string): void {
    const timestamp = new Date("2026-07-27T12:00:00.000Z");
    for (const directory of ["packages", "verifications"]) {
        const inventory = join(root, ".registry", "candidates", "objects", directory);
        for (const name of readdirSync(inventory)) {
            utimesSync(join(inventory, name), timestamp, timestamp);
        }
    }
}
