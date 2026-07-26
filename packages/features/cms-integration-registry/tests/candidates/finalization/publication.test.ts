import { afterEach, describe, expect, test } from "bun:test";
import type { ReleaseAdmissionPolicySnapshotV1 } from "@bernouy/cms-integration-verification";
import {
    FsIntegrationRegistryCandidateFinalizer,
    FsIntegrationRegistryCandidateStore,
} from "@bernouy/cms-integration-registry/fs";
import { reviewedBaseline } from "../../baselines/fixtures";
import {
    cleanupRegistryFixtures,
    publicationPackage,
    registryFixture,
    seedLegacySqlBaseline,
    sqlPublicationPackage,
} from "../../publication/fixtures";
import { planningPolicy, verificationCandidate } from "../planning/fixtures";
import { completePassedCandidate, finalizerConfig, passedCandidate, releaseFinalizer, releaseStores } from "./fixtures";
import { passedMigrationReport } from "./migration";

afterEach(cleanupRegistryFixtures);

describe("filesystem candidate release publication", () => {
    test("publishes exact evidence, activates latest, and survives a restart", async () => {
        const fixture = registryFixture();
        const setup = await passedCandidate(fixture, "candidate-finalize");
        const finalizer = releaseFinalizer(fixture, setup.store, setup.policy);

        const result = await finalizer.finalize("candidate-finalize");

        expect(result.status).toBe("published");
        expect(fixture.snapshots.current().getIndex("demo")?.latest).toBe("1.0.0");
        expect(fixture.snapshots.current().getIndex("demo")?.versions[0]).toMatchObject({
            version: "1.0.0",
            verificationDigest: setup.candidate.verificationDigest,
        });
        expect(fixture.snapshots.current().getIndex("demo")?.versions[0]?.status).toBeUndefined();
        expect(await setup.store.get("candidate-finalize")).toMatchObject({ status: "published" });

        const restartedStore = new FsIntegrationRegistryCandidateStore({ root: fixture.root });
        const restarted = releaseFinalizer(fixture, restartedStore, setup.policy);
        await expect(restarted.finalize("candidate-finalize")).resolves.toMatchObject({
            status: "published",
            decisionDigest: result.status === "published" ? result.decisionDigest : "",
        });
    });

    test("persists exact optional migration evidence before activating a stateful release", async () => {
        const fixture = registryFixture();
        const baselinePackage = await seedLegacySqlBaseline(fixture);
        await fixture.reviewedSchemaBaselines.append({
            baseline: await reviewedBaseline("baseline-finalization", {
                kind: "demo",
                packageDigest: baselinePackage.digest,
            }),
            expectedCurrentRevisionId: null,
        });
        const candidate = await verificationCandidate(
            await sqlPublicationPackage("demo", "1.1.0", {
                namespaces: [
                    {
                        name: "public",
                        relations: [
                            {
                                name: "items",
                                columns: [{ name: "id", type: "bigint", nullable: false }],
                                constraints: [],
                            },
                        ],
                    },
                ],
            }),
        );
        const basePolicy = await planningPolicy();
        const policy: ReleaseAdmissionPolicySnapshotV1 = {
            ...basePolicy,
            migrationEvidence: {
                ...basePolicy.migrationEvidence,
                requiredForReleaseLevels: ["minor"],
                requiredChecks: ["fresh-install", "migrated-state", "equivalence"],
            },
        };
        const setup = await completePassedCandidate(fixture, "candidate-stateful-finalization", candidate, policy);
        const migration = await passedMigrationReport(setup.plan.statefulChanges, setup.plan.admission.selectedRunner);
        const stores = releaseStores(fixture);
        const finalizer = new FsIntegrationRegistryCandidateFinalizer({
            ...finalizerConfig(fixture, setup.store, policy, stores),
            async loadMigrationReports() {
                return [migration];
            },
        });

        await expect(finalizer.finalize("candidate-stateful-finalization")).resolves.toMatchObject({
            status: "published",
        });
        const decisions = await stores.releaseDecisions.get("demo", "1.1.0");
        expect(decisions?.current.migrationReports).toHaveLength(1);
        expect(
            await stores.migrationReports.get({
                sourceKind: migration.source.kind,
                sourceVersion: migration.source.version,
                sourcePackageDigest: migration.source.packageDigest,
                targetKind: migration.target.kind,
                targetVersion: migration.target.version,
                targetPackageDigest: migration.target.packageDigest,
                connectorKey: migration.connectorKey,
                lineageId: migration.lineageId,
                migrationRevision: migration.migrationRevision,
            }),
        ).not.toBeNull();
    });

    test("keeps stale verified candidates private and non-installable", async () => {
        const fixture = registryFixture();
        const setup = await passedCandidate(fixture, "candidate-stale");
        await fixture.publisher.publish({ package: await publicationPackage("catalog-race", "1.0.0") });

        const result = await releaseFinalizer(fixture, setup.store, setup.policy).finalize("candidate-stale");

        expect(result.status).toBe("rejected");
        expect(fixture.snapshots.current().locateExactVersion("demo", "1.0.0")).toBeNull();
        expect(await setup.store.get("candidate-stale")).toMatchObject({
            status: "rejected",
            lastFailure: { kind: "stale", code: "admission_inputs_stale" },
        });
    });
});
