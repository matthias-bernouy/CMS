import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { VerificationJobResultV1 } from "@bernouy/cms-integration-verification";
import { FsIntegrationRegistryCandidateStore } from "@bernouy/cms-integration-registry/fs";
import {
    CANDIDATE_TIMES,
    candidateAdmission,
    candidateJobResult,
    candidatePolicy,
    candidateStoreFixture,
    createCandidate,
    queueCandidate,
} from "./fixtures";

let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

describe("filesystem candidate admission bindings", () => {
    test("persists exact admission inputs and accepts only an identical completion replay after restart", async () => {
        const fixture = await candidateStoreFixture();
        cleanup = fixture.cleanup;
        const queued = await queueCandidate(fixture);
        const running = await fixture.store.claim(fixture.candidateId, {
            expectedRevision: queued.revision,
            jobId: "job-1",
            attemptId: "attempt-1",
            workerId: "worker-1",
            now: CANDIDATE_TIMES.claimed,
            leaseExpiresAt: CANDIDATE_TIMES.lease,
        });
        const result = await candidateJobResult(fixture);
        const passed = await fixture.store.complete(fixture.candidateId, {
            expectedRevision: running.revision,
            now: CANDIDATE_TIMES.completed,
            result,
        });
        const restarted = new FsIntegrationRegistryCandidateStore({ root: fixture.root });

        expect(await restarted.get(fixture.candidateId)).toEqual(passed);
        expect((await restarted.objects(fixture.candidateId)).verificationJobResult).toEqual(result);
        expect(
            await restarted.complete(fixture.candidateId, {
                expectedRevision: running.revision,
                now: CANDIDATE_TIMES.completed,
                result,
            }),
        ).toEqual(passed);
        await expect(
            restarted.complete(fixture.candidateId, {
                expectedRevision: running.revision,
                now: CANDIDATE_TIMES.completed,
                result: { ...result, environment: { ...result.environment, digest: "0".repeat(64) } },
            }),
        ).rejects.toThrow();
    });

    test("rejects a policy mismatch before persisting or queueing an admission plan", async () => {
        const fixture = await candidateStoreFixture();
        cleanup = fixture.cleanup;
        const uploaded = await createCandidate(fixture);
        const validating = await fixture.store.advanceValidation(fixture.candidateId, {
            expectedRevision: uploaded.revision,
            now: CANDIDATE_TIMES.validating,
        });
        const policy = await candidatePolicy();
        const admission = await candidateAdmission(fixture, policy);

        await expect(
            fixture.store.queue(fixture.candidateId, {
                expectedRevision: validating.revision,
                now: CANDIDATE_TIMES.queued,
                policy: { ...policy, identity: { ...policy.identity, version: "1.0.1" } },
                admission,
            }),
        ).rejects.toThrow(/policyDigest/);
        expect(await fixture.store.get(fixture.candidateId)).toEqual(validating);
        expect(directoryEntries(fixture.root, "policies")).toEqual([]);
        expect(directoryEntries(fixture.root, "admissions")).toEqual([]);
    });

    test("rejects missing, extra, stale, fenced, and digest-divergent results before persistence", async () => {
        const fixture = await candidateStoreFixture();
        cleanup = fixture.cleanup;
        const queued = await queueCandidate(fixture);
        const running = await fixture.store.claim(fixture.candidateId, {
            expectedRevision: queued.revision,
            jobId: "job-1",
            attemptId: "attempt-1",
            workerId: "worker-1",
            now: CANDIDATE_TIMES.claimed,
            leaseExpiresAt: CANDIDATE_TIMES.lease,
        });
        const valid = await candidateJobResult(fixture);
        const invalid: VerificationJobResultV1[] = [
            { ...valid, results: [] },
            {
                ...valid,
                results: [...valid.results, { ...valid.results[0]!, suiteId: "unexpected-suite" }],
            },
            { ...valid, attemptId: "stale-attempt" },
            { ...valid, fencingToken: 2 },
            { ...valid, bindings: { ...valid.bindings, policyDigest: "0".repeat(64) } },
        ];
        for (const result of invalid) {
            await expect(
                fixture.store.complete(fixture.candidateId, {
                    expectedRevision: running.revision,
                    now: CANDIDATE_TIMES.completed,
                    result,
                }),
            ).rejects.toThrow();
        }

        expect(await fixture.store.get(fixture.candidateId)).toEqual(running);
        expect(directoryEntries(fixture.root, "results")).toEqual([]);
    });

    test("detects immutable admission and result object tampering on every read", async () => {
        const fixture = await candidateStoreFixture();
        cleanup = fixture.cleanup;
        const queued = await queueCandidate(fixture);
        const admissionPath = objectPath(fixture.root, "admissions", queued.admissionInputDigest!);
        const admissionBytes = readFileSync(admissionPath, "utf8");
        chmodSync(admissionPath, 0o640);
        writeFileSync(admissionPath, admissionBytes.replace("candidate-1", "candidate-2"));
        await expect(fixture.store.get(fixture.candidateId)).rejects.toThrow();
        writeFileSync(admissionPath, admissionBytes);
        const policyPath = objectPath(fixture.root, "policies", queued.policyDigest!);
        chmodSync(policyPath, 0o640);
        writeFileSync(
            policyPath,
            readFileSync(policyPath, "utf8").replace("candidate-admission", "tampered-admission"),
        );
        await expect(fixture.store.get(fixture.candidateId)).rejects.toThrow();
    });

    test("detects a tampered worker result after a successful completion", async () => {
        const fixture = await candidateStoreFixture();
        cleanup = fixture.cleanup;
        const queued = await queueCandidate(fixture);
        const running = await fixture.store.claim(fixture.candidateId, {
            expectedRevision: queued.revision,
            jobId: "job-1",
            attemptId: "attempt-1",
            workerId: "worker-1",
            now: CANDIDATE_TIMES.claimed,
            leaseExpiresAt: CANDIDATE_TIMES.lease,
        });
        const passed = await fixture.store.complete(fixture.candidateId, {
            expectedRevision: running.revision,
            now: CANDIDATE_TIMES.completed,
            result: await candidateJobResult(fixture),
        });
        const resultPath = objectPath(fixture.root, "results", passed.verificationJobResultDigest!);
        chmodSync(resultPath, 0o640);
        writeFileSync(resultPath, readFileSync(resultPath, "utf8").replace('"durationMs":10', '"durationMs":11'));

        await expect(fixture.store.get(fixture.candidateId)).rejects.toThrow();
    });
});

function directoryEntries(root: string, kind: string): string[] {
    return Array.from(new Bun.Glob("*.json").scanSync({ cwd: join(root, ".registry", "candidates", "objects", kind) }));
}

function objectPath(root: string, kind: string, digest: string): string {
    return join(root, ".registry", "candidates", "objects", kind, `${digest}.json`);
}
