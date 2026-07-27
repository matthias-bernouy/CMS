import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
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
    statefulSqlPublicationPackage,
} from "../../publication/fixtures";
import { planningPolicy, verificationCandidate } from "../planning/fixtures";
import { completePassedCandidate, finalizerConfig, passedCandidate, releaseFinalizer, releaseStores } from "./fixtures";

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

    test("finalizes a pre-migration v3 candidate from its exact raw verification result", async () => {
        const fixture = registryFixture();
        const setup = await passedCandidate(fixture, "candidate-legacy-v3");
        rewriteAsPreMigrationV3(fixture.root, setup.completion);
        const restartedStore = new FsIntegrationRegistryCandidateStore({ root: fixture.root });

        await expect(
            releaseFinalizer(fixture, restartedStore, setup.policy).finalize("candidate-legacy-v3"),
        ).resolves.toMatchObject({ status: "published" });
    });

    test("admits exact SQL evidence without claiming unexecuted cutover evidence", async () => {
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
            await statefulSqlPublicationPackage(
                "demo",
                "1.1.0",
                {
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
                },
                [],
                {
                    cmsMediated: { strategy: "binding-switch", drainSeconds: 30 },
                    providerDirect: {
                        strategy: "expand-in-code",
                        callbackIds: ["stripe-webhook"],
                        drainSeconds: 60,
                    },
                },
            ),
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
        const failed = await completePassedCandidate(fixture, "candidate-stateful-failed", candidate, policy, {
            migrationObservationStatus: "failed",
        });
        expect(failed.completion).toMatchObject({ status: "rejected", lastFailure: { kind: "suite" } });
        expect(fixture.snapshots.current().locateExactVersion("demo", "1.1.0")).toBeNull();
        const infrastructure = await completePassedCandidate(
            fixture,
            "candidate-stateful-infrastructure",
            candidate,
            policy,
            { migrationObservationStatus: "infrastructure-failure" },
        );
        expect(infrastructure.completion).toMatchObject({
            status: "queued",
            lastFailure: { kind: "infrastructure" },
        });
        const failClosedPolicy: ReleaseAdmissionPolicySnapshotV1 = {
            ...policy,
            migrationEvidence: {
                ...policy.migrationEvidence,
                requiredChecks: ["fresh-install", "migrated-state", "equivalence", "failure-injection", "resumption"],
            },
        };
        const missingRequiredEvidence = await completePassedCandidate(
            fixture,
            "candidate-stateful-missing-required-evidence",
            candidate,
            failClosedPolicy,
        );
        expect(missingRequiredEvidence.completion).toMatchObject({
            status: "rejected",
            lastFailure: { kind: "suite" },
        });
        const setup = await completePassedCandidate(fixture, "candidate-stateful-finalization", candidate, policy);
        const rawMigration = (await setup.store.objects("candidate-stateful-finalization")).admissionJobResult
            ?.migrations[0];
        expect(rawMigration?.observations.cutover).toMatchObject({
            cmsMediated: {
                status: "not-supported",
                strategy: "binding-switch",
                diagnosticCodes: ["sql-runner-does-not-exercise-cutover"],
            },
            providerDirect: {
                status: "not-supported",
                strategy: "expand-in-code",
                callbackIds: ["stripe-webhook"],
                diagnosticCodes: ["sql-runner-does-not-exercise-cutover"],
            },
            activation: {
                status: "not-supported",
                diagnosticCodes: ["sql-runner-does-not-exercise-cutover"],
            },
        });
        const stores = releaseStores(fixture);
        const finalizer = new FsIntegrationRegistryCandidateFinalizer(
            finalizerConfig(fixture, setup.store, setup.policy, stores),
        );

        await expect(finalizer.finalize("candidate-stateful-finalization")).resolves.toMatchObject({
            status: "published",
        });
        const decisions = await stores.releaseDecisions.get("demo", "1.1.0");
        expect(decisions?.current.migrationReports).toHaveLength(1);
        const migrationInput = setup.plan.migrationInputs[0]!;
        const migrationHistory = await stores.migrationReports.get({
            sourceKind: migrationInput.source.kind,
            sourceVersion: migrationInput.source.version,
            sourcePackageDigest: migrationInput.source.packageDigest,
            targetKind: migrationInput.target.kind,
            targetVersion: migrationInput.target.version,
            targetPackageDigest: migrationInput.target.packageDigest,
            connectorKey: migrationInput.connectorKey,
            lineageId: migrationInput.lineageId,
            migrationRevision: migrationInput.targetMigrationRevision,
        });
        expect(migrationHistory?.current).toMatchObject({
            schema: "cms.integration.migration-report.v4",
            outcome: "passed",
            cutover: {
                cmsMediated: "binding-revision",
                providerDirect: "expand-in-code",
            },
            policyEvaluation: {
                applicable: true,
                satisfied: true,
                checks: expect.not.arrayContaining([
                    expect.objectContaining({ check: "cms-mediated-cutover" }),
                    expect.objectContaining({ check: "provider-direct-cutover" }),
                ]),
            },
            operationalEvidence: {
                downtime: { status: "not-measured" },
                drain: { cmsMediatedSeconds: 30, providerDirectSeconds: 60 },
                rollback: { capability: "unavailable", verified: false },
                pointOfNoReturn: { phase: "before-contract", observation: "not-observed" },
                cleanup: { delaySeconds: 60, observed: false },
            },
            cutoverEvidence: {
                cmsMediated: { outcome: "not-supported" },
                providerDirect: { outcome: "not-supported" },
                activation: { outcome: "not-supported" },
            },
        });
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

function rewriteAsPreMigrationV3(
    root: string,
    completion: Readonly<{ candidateId: string; admissionJobResultDigest?: string }>,
): void {
    const records = join(root, ".registry", "candidates", "records", completion.candidateId);
    for (const name of readdirSync(records)) {
        const path = join(records, name);
        const record = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
        delete record.migrationInputDigests;
        delete record.admissionJobResultDigest;
        chmodSync(path, 0o640);
        writeFileSync(path, canonicalJsonBytes(record));
    }
    if (completion.admissionJobResultDigest) {
        unlinkSync(
            join(root, ".registry", "candidates", "objects", "results", `${completion.admissionJobResultDigest}.json`),
        );
    }
}
