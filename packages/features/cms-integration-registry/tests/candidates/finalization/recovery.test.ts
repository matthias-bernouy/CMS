import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import {
    IntegrationCompatibilityEvaluator,
    IntegrationCompatibilityReevaluationPendingActivationError,
} from "@bernouy/cms-integration-registry";
import {
    FsIntegrationCompatibilityReevaluator,
    FsIntegrationRegistryCandidateFinalizer,
    FsIntegrationRegistryCandidateStore,
    recoverVerifiedCandidateActivations,
} from "@bernouy/cms-integration-registry/fs";
import { cleanupRegistryFixtures, registryFixture } from "../../publication/fixtures";
import { finalizerConfig, passedCandidate, releaseStores } from "./fixtures";

afterEach(cleanupRegistryFixtures);

describe("filesystem candidate release recovery", () => {
    test("resumes after the immutable package became live but report persistence failed", async () => {
        const fixture = registryFixture();
        const setup = await passedCandidate(fixture, "candidate-resume");
        const stores = releaseStores(fixture);
        let failOnce = true;
        const interrupted = new FsIntegrationRegistryCandidateFinalizer({
            ...finalizerConfig(fixture, setup.store, setup.policy, stores),
            verificationReports: {
                get: (...input) => stores.verificationReports.get(...input),
                append: async (input) => {
                    if (failOnce) {
                        failOnce = false;
                        throw new Error("simulated report store outage");
                    }
                    return await stores.verificationReports.append(input);
                },
            },
        });

        await expect(interrupted.finalize("candidate-resume")).rejects.toThrow(/simulated report store outage/);
        expect(fixture.snapshots.current().getIndex("demo")?.versions[0]).toMatchObject({ status: "unverified" });
        expect(await setup.store.get("candidate-resume")).toMatchObject({ status: "publishing" });

        await expect(interrupted.finalize("candidate-resume")).resolves.toMatchObject({ status: "published" });
        expect(fixture.snapshots.current().getIndex("demo")?.versions[0]?.status).toBeUndefined();
    });

    test("replays a journaled activation after restart without accepting substituted evidence", async () => {
        const fixture = registryFixture();
        const setup = await passedCandidate(fixture, "candidate-activation-recovery");
        const stores = releaseStores(fixture);
        const base = finalizerConfig(fixture, setup.store, setup.policy, stores);
        const crashing = new FsIntegrationRegistryCandidateFinalizer({
            ...base,
            afterActivationPhase(phase) {
                if (phase === "index-written") {
                    throw new Error("simulated process crash");
                }
            },
        });

        await expect(crashing.finalize("candidate-activation-recovery")).rejects.toThrow(/simulated process crash/);
        expect(await setup.store.get("candidate-activation-recovery")).toMatchObject({ status: "publishing" });

        const restartedStore = new FsIntegrationRegistryCandidateStore({ root: fixture.root });
        const restartedConfig = finalizerConfig(fixture, restartedStore, setup.policy, stores);
        await expect(recoverVerifiedCandidateActivations(restartedConfig)).resolves.toEqual([
            "candidate-activation-recovery",
        ]);
        expect(await restartedStore.get("candidate-activation-recovery")).toMatchObject({ status: "published" });
        expect(fixture.snapshots.current().getIndex("demo")?.versions[0]?.status).toBeUndefined();
    });

    test("rejects a forged activation journal without making the version installable", async () => {
        const fixture = registryFixture();
        const setup = await passedCandidate(fixture, "candidate-forged-activation");
        const stores = releaseStores(fixture);
        const base = finalizerConfig(fixture, setup.store, setup.policy, stores);
        const crashing = new FsIntegrationRegistryCandidateFinalizer({
            ...base,
            afterActivationPhase(phase) {
                if (phase === "prepared") {
                    throw new Error("simulated process crash");
                }
            },
        });
        await expect(crashing.finalize("candidate-forged-activation")).rejects.toThrow(/simulated process crash/);
        const journalPath = join(
            fixture.root,
            ".registry",
            "candidate-activations",
            "candidate-forged-activation.json",
        );
        const journal = JSON.parse(readFileSync(journalPath, "utf8"));
        chmodSync(journalPath, 0o600);
        writeFileSync(journalPath, canonicalJsonBytes({ ...journal, decisionDigest: "0".repeat(64) }));

        await expect(recoverVerifiedCandidateActivations(base)).rejects.toThrow(
            /absent, stale, inadmissible, or substituted/,
        );
        expect(fixture.snapshots.current().getIndex("demo")?.versions[0]).toMatchObject({ status: "unverified" });
        expect(await setup.store.get("candidate-forged-activation")).toMatchObject({ status: "publishing" });
    });

    test("fences a concurrent finalizer while one request owns publication", async () => {
        const fixture = registryFixture();
        const setup = await passedCandidate(fixture, "candidate-finalization-race");
        const stores = releaseStores(fixture);
        let entered!: () => void;
        let release!: () => void;
        const enteredPromise = new Promise<void>((resolve) => {
            entered = resolve;
        });
        const releasePromise = new Promise<void>((resolve) => {
            release = resolve;
        });
        const config = finalizerConfig(fixture, setup.store, setup.policy, stores);
        const finalizer = new FsIntegrationRegistryCandidateFinalizer({
            ...config,
            verificationReports: {
                get: (...input) => stores.verificationReports.get(...input),
                append: async (input) => {
                    entered();
                    await releasePromise;
                    return await stores.verificationReports.append(input);
                },
            },
        });

        const owner = finalizer.finalize("candidate-finalization-race");
        await enteredPromise;
        await expect(finalizer.finalize("candidate-finalization-race")).rejects.toMatchObject({
            code: "publication_recovery_required",
        });
        release();
        await expect(owner).resolves.toMatchObject({ status: "published" });
    });

    test("defers compatibility reevaluation until the unverified candidate is activated", async () => {
        const fixture = registryFixture();
        const setup = await passedCandidate(fixture, "candidate-reevaluation-race");
        const stores = releaseStores(fixture);
        const reevaluator = new FsIntegrationCompatibilityReevaluator({
            snapshots: fixture.snapshots,
            reports: stores.compatibilityReports,
            evaluator: new IntegrationCompatibilityEvaluator({
                identity: { name: "registry-race-test", version: "1.0.0" },
                now: () => "2026-07-26T10:00:06.000Z",
                createReportId: () => "candidate-race-reevaluation",
            }),
            reviewedSchemaBaselines: fixture.reviewedSchemaBaselines,
        });
        let interleavedFailure: unknown;
        const finalizer = new FsIntegrationRegistryCandidateFinalizer({
            ...finalizerConfig(fixture, setup.store, setup.policy, stores),
            compatibilityReports: {
                get: (...input) => stores.compatibilityReports.get(...input),
                list: (...input) => stores.compatibilityReports.list(...input),
                append: async (input) => {
                    const history = await stores.compatibilityReports.append(input);
                    expect(fixture.snapshots.current().getIndex("demo")?.versions[0]?.status).toBe("unverified");
                    try {
                        await reevaluator.reevaluate({
                            kind: "demo",
                            version: "1.0.0",
                            currentReport: {
                                revisionId: history.currentRevisionId,
                                reportDigest: history.currentReportDigest,
                            },
                            actor: "admin:race-test",
                            reason: "Interleave reevaluation before candidate activation",
                        });
                    } catch (error) {
                        interleavedFailure = error;
                    }
                    return history;
                },
            },
        });

        await expect(finalizer.finalize("candidate-reevaluation-race")).resolves.toMatchObject({
            status: "published",
        });
        expect(interleavedFailure).toBeInstanceOf(IntegrationCompatibilityReevaluationPendingActivationError);
        expect(fixture.snapshots.current().getIndex("demo")?.versions[0]?.status).toBeUndefined();

        const current = await stores.compatibilityReports.get("demo", "1.0.0");
        expect(current).not.toBeNull();
        const reevaluated = await reevaluator.reevaluate({
            kind: "demo",
            version: "1.0.0",
            currentReport: {
                revisionId: current!.currentRevisionId,
                reportDigest: current!.currentReportDigest,
            },
            actor: "admin:race-test",
            reason: "Reevaluate after candidate activation",
        });
        expect(reevaluated).toMatchObject({
            revision: { supersedes: current!.currentRevisionId },
        });
    });
});
