import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import {
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
});
