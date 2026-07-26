import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
    FsIntegrationRegistryCandidateStore,
    recoverFsIntegrationRegistryCandidates,
} from "@bernouy/cms-integration-registry/fs";
import { candidateStoreFixture, createCandidate, queueCandidate } from "./fixtures";

let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

describe("filesystem integration registry candidate recovery", () => {
    test("recovers expired claims, then applies candidate TTL deterministically", async () => {
        const fixture = await candidateStoreFixture("candidate-ttl", "2026-07-26T10:04:30.000Z");
        cleanup = fixture.cleanup;
        const queued = await queueCandidate(fixture);
        await fixture.store.claim(fixture.candidateId, {
            expectedRevision: queued.revision,
            jobId: "job-1",
            attemptId: "attempt-1",
            workerId: "worker-1",
            now: "2026-07-26T10:03:00.000Z",
            leaseExpiresAt: "2026-07-26T10:04:00.000Z",
        });

        const result = await recoverFsIntegrationRegistryCandidates({
            root: fixture.root,
            now: "2026-07-26T10:05:01.000Z",
        });
        const restarted = new FsIntegrationRegistryCandidateStore({ root: fixture.root });

        expect(result).toMatchObject({ recoveredLeases: 1, expiredCandidates: 1, quarantinedEntries: 0 });
        expect(await restarted.get(fixture.candidateId)).toMatchObject({
            revision: 5,
            status: "expired",
            attemptCount: 1,
            lastFailure: { code: "lease_expired" },
        });
    });

    test("quarantines corrupt canonical metadata instead of accepting a partial history", async () => {
        const fixture = await candidateStoreFixture();
        cleanup = fixture.cleanup;
        await createCandidate(fixture);
        const revision = join(
            fixture.root,
            ".registry",
            "candidates",
            "records",
            fixture.candidateId,
            "0000000000000000.json",
        );
        chmodSync(revision, 0o640);
        writeFileSync(revision, '{"schema":"corrupt"}');

        await expect(fixture.store.get(fixture.candidateId)).rejects.toThrow();
        const result = await recoverFsIntegrationRegistryCandidates({
            root: fixture.root,
            now: "2026-07-26T11:00:00.000Z",
        });

        expect(result.quarantinedEntries).toBe(1);
        expect(result.diagnostics[0]?.code).toBe("quarantined_candidate");
        expect(await fixture.store.get(fixture.candidateId)).toBeNull();
    });

    test("quarantines abandoned temporary writes after a grace period", async () => {
        const fixture = await candidateStoreFixture();
        cleanup = fixture.cleanup;
        await createCandidate(fixture);
        const temporary = join(
            fixture.root,
            ".registry",
            "candidates",
            "objects",
            "packages",
            ".00000000-0000-4000-8000-000000000000.tmp",
        );
        const recordTemporary = join(
            fixture.root,
            ".registry",
            "candidates",
            "records",
            fixture.candidateId,
            ".11111111-1111-4111-8111-111111111111.tmp",
        );
        writeFileSync(temporary, "partial");
        writeFileSync(recordTemporary, "partial");
        utimesSync(temporary, new Date("2026-07-26T09:00:00.000Z"), new Date("2026-07-26T09:00:00.000Z"));
        utimesSync(recordTemporary, new Date("2026-07-26T09:00:00.000Z"), new Date("2026-07-26T09:00:00.000Z"));

        const result = await recoverFsIntegrationRegistryCandidates({
            root: fixture.root,
            now: "2026-07-26T11:00:00.000Z",
            temporaryGraceMs: 60_000,
        });

        expect(existsSync(temporary)).toBeFalse();
        expect(existsSync(recordTemporary)).toBeFalse();
        expect(result.diagnostics.filter((entry) => entry.code === "quarantined_temporary")).toHaveLength(2);
        expect(await fixture.store.get(fixture.candidateId)).not.toBeNull();
    });

    test("does not quarantine a new candidate while its first canonical revision is in flight", async () => {
        const fixture = await candidateStoreFixture("candidate-writing");
        cleanup = fixture.cleanup;
        await fixture.store.get("layout-ready");
        const root = join(fixture.root, ".registry", "candidates", "records", fixture.candidateId);
        mkdirSync(root, { recursive: true });
        const temporary = join(root, ".22222222-2222-4222-8222-222222222222.tmp");
        writeFileSync(temporary, "partial");

        const result = await recoverFsIntegrationRegistryCandidates({
            root: fixture.root,
            now: "2026-07-26T10:00:30.000Z",
            temporaryGraceMs: 60_000,
        });

        expect(result.quarantinedEntries).toBe(0);
        expect(existsSync(root)).toBeTrue();
        expect(existsSync(temporary)).toBeTrue();
    });
});
