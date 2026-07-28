import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import {
    garbageCollectFsIntegrationRegistryCandidateObjects,
    readPrunedCandidate,
    recoverFsIntegrationRegistryCandidates,
} from "@bernouy/cms-integration-registry/fs";
import {
    backdateCandidateObjects,
    CANDIDATE_TIMES,
    candidateStoreFixture,
    createCandidate,
    expiredCandidate,
    queueCandidate,
} from "../fixtures";

let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

describe("filesystem terminal candidate retention", () => {
    test("never prunes an active candidate with a current worker lease", async () => {
        const fixture = await candidateStoreFixture("leased-candidate");
        cleanup = fixture.cleanup;
        const queued = await queueCandidate(fixture);
        const running = await fixture.store.claim(fixture.candidateId, {
            expectedRevision: queued.revision,
            jobId: "leased-job",
            attemptId: "leased-attempt",
            workerId: "leased-worker",
            now: CANDIDATE_TIMES.claimed,
            leaseExpiresAt: CANDIDATE_TIMES.lease,
        });

        const result = await garbageCollectFsIntegrationRegistryCandidateObjects({
            root: fixture.root,
            now: "2026-07-26T10:04:00.000Z",
            gracePeriodMs: 0,
            terminalRecordGracePeriodMs: 0,
            auditRetentionMs: 1,
        });

        expect(result.prunedCandidateIds).toEqual([]);
        expect(result.removedObjects).toBe(0);
        expect(result.retainedReferencedObjects).toBeGreaterThan(0);
        expect(await fixture.store.get(fixture.candidateId)).toEqual(running);
    });

    test("fails closed when the global candidate record inventory is exhausted", async () => {
        const fixture = await candidateStoreFixture();
        cleanup = fixture.cleanup;
        await fixture.store.get("layout-only");
        const records = join(fixture.root, ".registry", "candidates", "records");
        for (let index = 0; index <= 4_096; index += 1) {
            mkdirSync(join(records, `candidate-${index.toString().padStart(4, "0")}`));
        }

        await expect(fixture.store.listClaimable("2026-07-26T12:00:00.000Z")).rejects.toMatchObject({
            code: "inventory_limit",
        });
    });

    test("prunes old terminal records, frees objects, and expires the bounded audit", async () => {
        const fixture = await expiredCandidate("expired-candidate");
        cleanup = fixture.cleanup;
        backdateCandidateObjects(fixture.root);
        const pruned = await garbageCollectFsIntegrationRegistryCandidateObjects({
            root: fixture.root,
            now: "2026-07-28T12:00:00.000Z",
            gracePeriodMs: 0,
            terminalRecordGracePeriodMs: 24 * 60 * 60 * 1_000,
            auditRetentionMs: 30 * 24 * 60 * 60 * 1_000,
        });
        const auditPath = join(fixture.root, ".registry", "candidates", "pruned", `${fixture.candidateId}.json`);

        expect(pruned.prunedCandidateIds).toEqual([fixture.candidateId]);
        expect(pruned.removedObjects).toBe(2);
        expect(await fixture.store.get(fixture.candidateId)).toBeNull();
        await expect(createCandidate(fixture)).rejects.toMatchObject({ code: "candidate_exists" });
        expect(await readPrunedCandidate(auditPath)).toMatchObject({
            candidateId: fixture.candidateId,
            submittedBy: "admin@example.com",
            finalStatus: "expired",
            finalRevision: 1,
        });

        const expiredAudit = await garbageCollectFsIntegrationRegistryCandidateObjects({
            root: fixture.root,
            now: "2026-08-30T12:00:00.000Z",
            gracePeriodMs: 0,
            terminalRecordGracePeriodMs: 0,
            auditRetentionMs: 30 * 24 * 60 * 60 * 1_000,
        });
        expect(expiredAudit.removedAuditRecords).toBe(1);
        expect(existsSync(auditPath)).toBeFalse();
    });

    test("refuses a terminal prune before writing beyond the bounded audit inventory", async () => {
        const fixture = await expiredCandidate("blocked-prune");
        cleanup = fixture.cleanup;
        const audits = join(fixture.root, ".registry", "candidates", "pruned");
        for (let index = 0; index < 4_096; index += 1) {
            writeAudit(audits, `audit-${index.toString().padStart(4, "0")}`);
        }

        await expect(
            garbageCollectFsIntegrationRegistryCandidateObjects({
                root: fixture.root,
                now: "2026-07-29T12:00:00.000Z",
                gracePeriodMs: 0,
                terminalRecordGracePeriodMs: 0,
                auditRetentionMs: 30 * 24 * 60 * 60 * 1_000,
            }),
        ).rejects.toMatchObject({ code: "inventory_limit" });
        expect(existsSync(join(audits, `${fixture.candidateId}.json`))).toBeFalse();
        expect(existsSync(join(fixture.root, ".registry", "candidates", "records", fixture.candidateId))).toBeTrue();
        expect(readdirSync(audits)).toHaveLength(4_096);
    });

    test("finishes an audited pruning interrupted after the atomic record move", async () => {
        const fixture = await expiredCandidate("interrupted-prune");
        cleanup = fixture.cleanup;
        const record = await fixture.store.get(fixture.candidateId);
        expect(record).not.toBeNull();
        const candidateRoot = join(fixture.root, ".registry", "candidates");
        writeFileSync(
            join(candidateRoot, "pruned", `${fixture.candidateId}.json`),
            canonicalJsonBytes({
                schema: "cms.integration.registry.pruned-candidate.v1",
                candidateId: record!.candidateId,
                submittedBy: record!.submittedBy,
                kind: record!.kind,
                version: record!.version,
                candidateDigest: record!.candidateDigest,
                packageDigest: record!.packageDigest,
                verificationDigest: record!.verificationDigest,
                finalStatus: record!.status,
                finalRevision: record!.revision,
                prunedAt: "2026-07-28T12:00:00.000Z",
            }),
            { mode: 0o440 },
        );
        renameSync(
            join(candidateRoot, "records", fixture.candidateId),
            join(candidateRoot, "pruning", fixture.candidateId),
        );

        await recoverFsIntegrationRegistryCandidates({
            root: fixture.root,
            now: "2026-07-28T12:01:00.000Z",
        });

        expect(existsSync(join(candidateRoot, "pruning", fixture.candidateId))).toBeFalse();
        expect(await fixture.store.get(fixture.candidateId)).toBeNull();
    });
});

function writeAudit(root: string, candidateId: string): void {
    writeFileSync(
        join(root, `${candidateId}.json`),
        canonicalJsonBytes({
            schema: "cms.integration.registry.pruned-candidate.v1",
            candidateId,
            kind: "example",
            version: "1.0.0",
            candidateDigest: "1".repeat(64),
            packageDigest: "2".repeat(64),
            verificationDigest: "3".repeat(64),
            finalStatus: "expired",
            finalRevision: 1,
            prunedAt: "2026-07-28T12:00:00.000Z",
        }),
        { mode: 0o440 },
    );
}
