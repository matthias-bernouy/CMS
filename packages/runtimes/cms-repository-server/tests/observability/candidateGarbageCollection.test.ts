import { afterEach, describe, expect, test } from "bun:test";
import { FsIntegrationRegistryCandidateStore } from "@bernouy/cms-integration-registry/fs";
import {
    type CandidateGarbageCollectionSchedule,
    ProductionCandidateGarbageCollector,
} from "../../src/core/candidates/garbageCollection";
import { startRepositoryWithCandidateGarbageCollection } from "../../src/core/candidates/garbageCollectionServer";
import {
    createConsoleRepositoryOperationLogSink,
    RepositoryOperationalTelemetry,
} from "../../src/core/observability/telemetry";
import { TemporaryRoots } from "../storage/fixtures";
import { runtimeCandidateValue } from "../storage/candidateProtocolValues";

const roots = new TemporaryRoots();
afterEach(() => roots.cleanup());

describe("production candidate garbage collection", () => {
    test("completes startup collection before listeners and coalesces lifecycle shutdown", async () => {
        const root = await roots.create();
        const telemetry = new RepositoryOperationalTelemetry();
        let starts = 0;
        let stops = 0;

        const server = await startRepositoryWithCandidateGarbageCollection({
            root,
            policy: POLICY,
            telemetry,
            startServer: () => {
                starts += 1;
                expect(telemetry.snapshot().candidateGarbageCollection.succeeded).toBe(1);
                return {
                    refreshCatalog: async () => ({}) as never,
                    stop: async () => {
                        stops += 1;
                    },
                };
            },
        });

        expect(starts).toBe(1);
        await Promise.all([server.stop(), server.stop()]);
        expect(stops).toBe(1);
    });

    test("applies terminal retention on restart before serving periodic work", async () => {
        const root = await roots.create();
        const store = new FsIntegrationRegistryCandidateStore({ root });
        const uploaded = await store.create({
            candidateId: "restart-retention",
            candidate: await runtimeCandidateValue(),
            createdAt: "2026-07-26T10:00:00.000Z",
            expiresAt: "2026-07-26T10:30:00.000Z",
        });
        await store.expire(uploaded.candidateId, uploaded.revision, "2026-07-26T10:30:00.000Z");
        const telemetry = new RepositoryOperationalTelemetry();

        const first = collector(root, "2026-07-26T12:00:00.000Z", telemetry);
        expect((await first.instance.start()).prunedCandidateIds).toEqual([]);
        expect(await store.get(uploaded.candidateId)).not.toBeNull();
        await first.instance.stop();
        expect(first.scheduled[0]?.cancelled).toBeTrue();

        const restarted = collector(root, "2026-07-28T12:00:00.000Z", telemetry);
        const result = await restarted.instance.start();
        expect(result.prunedCandidateIds).toEqual([uploaded.candidateId]);
        expect(result.removedObjects).toBe(2);
        expect(await store.get(uploaded.candidateId)).toBeNull();
        expect(telemetry.snapshot().candidateGarbageCollection).toMatchObject({
            attempted: 2,
            succeeded: 2,
            failed: 0,
            removedObjects: 2,
            prunedCandidates: 1,
            lastSuccessAt: "2026-07-28T12:00:00.000Z",
        });
        await restarted.instance.stop();
    });

    test("continues after a bounded periodic failure and emits aggregate-safe structured logs", async () => {
        const scheduled: ScheduledTask[] = [];
        const lines: string[] = [];
        const telemetry = new RepositoryOperationalTelemetry({
            log: createConsoleRepositoryOperationLogSink((line) => lines.push(line)),
        });
        let attempt = 0;
        const instance = new ProductionCandidateGarbageCollector({
            root: "/registry/private-must-not-be-logged",
            ...POLICY,
            now: () => new Date(`2026-07-26T1${attempt}:00:00.000Z`),
            durationNow: () => attempt * 7,
            schedule: manualSchedule(scheduled),
            collect: async () => {
                attempt += 1;
                if (attempt === 2) {
                    throw Object.assign(new Error("Bearer secret at /registry/private"), { code: "mutation_locked" });
                }
                return {
                    removedObjects: attempt === 3 ? 4 : 0,
                    retainedReferencedObjects: 2,
                    retainedWithinGraceObjects: 1,
                    prunedCandidateIds: attempt === 3 ? ["candidate-a"] : [],
                    removedAuditRecords: attempt === 3 ? 1 : 0,
                };
            },
            observe: (entry) => telemetry.observeCandidateGarbageCollection(entry),
        });

        await instance.start();
        expect(scheduled[0]?.delayMs).toBe(POLICY.candidateGarbageCollectionIntervalMs);
        await scheduled[0]!.task();
        expect(scheduled).toHaveLength(2);
        await scheduled[1]!.task();

        expect(telemetry.snapshot().candidateGarbageCollection).toMatchObject({
            attempted: 3,
            succeeded: 2,
            failed: 1,
            removedObjects: 4,
            prunedCandidates: 1,
            removedAuditRecords: 1,
        });
        expect(telemetry.snapshot().candidateGarbageCollection.lastErrorCode).toBe("mutation_locked");
        expect(lines.map((line) => JSON.parse(line))).toMatchObject([
            { trigger: "startup", outcome: "succeeded" },
            { trigger: "periodic", outcome: "failed", errorCode: "mutation_locked" },
            { trigger: "periodic", outcome: "succeeded", removedObjects: 4 },
        ]);
        expect(lines.join("\n")).not.toContain("Bearer secret");
        expect(lines.join("\n")).not.toContain("/registry/private");
        await instance.stop();
        expect(scheduled[2]?.cancelled).toBeTrue();
    });
});

const POLICY = Object.freeze({
    candidateGarbageCollectionIntervalMs: 21_600_000,
    candidateObjectGracePeriodMs: 0,
    candidateTerminalRetentionMs: 86_400_000,
    candidatePruneAuditRetentionMs: 2_592_000_000,
});

type ScheduledTask = {
    task: () => Promise<void>;
    delayMs: number;
    cancelled: boolean;
};

function manualSchedule(entries: ScheduledTask[]): CandidateGarbageCollectionSchedule {
    return (task, delayMs) => {
        const entry = { task, delayMs, cancelled: false };
        entries.push(entry);
        return { cancel: () => (entry.cancelled = true) };
    };
}

function collector(root: string, now: string, telemetry: RepositoryOperationalTelemetry) {
    const scheduled: ScheduledTask[] = [];
    return {
        scheduled,
        instance: new ProductionCandidateGarbageCollector({
            root,
            ...POLICY,
            now: () => new Date(now),
            schedule: manualSchedule(scheduled),
            observe: (entry) => telemetry.observeCandidateGarbageCollection(entry),
        }),
    };
}
