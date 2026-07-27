import { afterEach, describe, expect, test } from "bun:test";
import {
    FsIntegrationRegistryCandidateAdmissionPlanner,
    FsIntegrationRegistryCandidateStore,
} from "@bernouy/cms-integration-registry/fs";
import { computeIntegrationVerificationSuiteContentDigest } from "@bernouy/cms-integration-verification";
import { reviewedBaseline } from "../../baselines/fixtures";
import {
    cleanupRegistryFixtures,
    publicationPackage,
    registryFixture,
    seedLegacySqlBaseline,
    statefulSqlPublicationPackage,
} from "../../publication/fixtures";
import { planningMigrationConfiguration, planningPolicy, validatingCandidate, verificationCandidate } from "./fixtures";

afterEach(cleanupRegistryFixtures);

describe("filesystem candidate admission planning", () => {
    test("pins compatibility, dependency, runner, author suites, and restart-safe planning objects", async () => {
        const fixture = registryFixture();
        const dependency = await publicationPackage("dependency", "1.0.0", {}, "stable implementation\n");
        const baseline = await publicationPackage("demo", "1.0.0", {}, "stable implementation\n");
        await fixture.publisher.publish({ package: dependency });
        await fixture.publisher.publish({ package: baseline });
        const target = await publicationPackage(
            "demo",
            "1.1.0",
            { dependencies: [{ name: "dependency", kind: "dependency", versionRange: "^1.0.0" }] },
            "stable implementation\n",
        );
        const candidate = await verificationCandidate(target, {
            contracts: [{ contractId: "public-api", entrypoint: "tests/contract.ts", activeMajorRange: "^1.0.0" }],
            conformance: [{ suiteId: "implementation", entrypoint: "tests/conformance.ts" }],
            fixtures: ["fixtures/input.json"],
        });
        const store = await validatingCandidate(fixture.root, "candidate-demo-1", candidate);
        const planner = new FsIntegrationRegistryCandidateAdmissionPlanner({
            snapshots: fixture.snapshots,
            mutations: fixture.mutations,
            candidates: store,
            reviewedSchemaBaselines: fixture.reviewedSchemaBaselines,
            policy: await planningPolicy(),
        });

        const plan = await planner.plan({ candidateId: "candidate-demo-1", candidate });
        const restartedBeforeQueue = new FsIntegrationRegistryCandidateStore({ root: fixture.root });
        const queued = await restartedBeforeQueue.queue("candidate-demo-1", {
            expectedRevision: 1,
            now: "2026-07-26T10:00:02.000Z",
            policy: plan.policy,
            admission: plan.admission,
        });

        expect(queued.compatibilityReportDigest).toBe(plan.compatibilityReportDigest);
        expect(queued.statefulChangeSelectionDigest).toBe(plan.statefulChangeSelectionDigest);
        expect(plan.admission.dependencies).toEqual([
            { selection: "minimum", kind: "dependency", version: "1.0.0", packageDigest: dependency.digest },
            { selection: "stable", kind: "dependency", version: "1.0.0", packageDigest: dependency.digest },
        ]);
        expect(plan.admission.activeContracts[0]?.contractId).toBe("public-api");
        expect(plan.admission.activeContracts[0]?.contractDigest).toBe(
            await computeIntegrationVerificationSuiteContentDigest(
                candidate.envelope.verification,
                "contract",
                "public-api",
            ),
        );
        expect(plan.admission.suites.map((suite) => suite.suiteId)).toEqual([
            "implementation",
            "platform-install",
            "public-api",
        ]);

        const restartedAfterQueue = new FsIntegrationRegistryCandidateStore({ root: fixture.root });
        const objects = await restartedAfterQueue.objects("candidate-demo-1");
        expect(objects.compatibilityReport?.baselines).toEqual([
            { kind: "demo", version: "1.0.0", packageDigest: baseline.digest },
        ]);
        expect(objects.compatibilityReport?.findings.every((finding) => finding.findingId.length === 64)).toBeTrue();
        expect(objects.statefulChanges?.requiredMigrations).toEqual([]);
        expect(objects.admission?.catalogRevision.digest).toHaveLength(64);
    });

    test("includes inherited contracts without copying them into the target verification bundle", async () => {
        const fixture = registryFixture();
        const target = await publicationPackage("new-kind", "1.0.0");
        const candidate = await verificationCandidate(target);
        const store = await validatingCandidate(fixture.root, "candidate-inherited", candidate);
        const contractDigest = "9".repeat(64);
        const planner = new FsIntegrationRegistryCandidateAdmissionPlanner({
            snapshots: fixture.snapshots,
            mutations: fixture.mutations,
            candidates: store,
            reviewedSchemaBaselines: fixture.reviewedSchemaBaselines,
            policy: await planningPolicy(),
            inheritedContracts: {
                async listActive() {
                    return [
                        {
                            reference: {
                                contractId: "legacy-contract",
                                lineageId: "legacy-lineage",
                                ownerVersion: "1.0.0",
                                contractDigest,
                            },
                            suite: {
                                suiteId: "legacy-contract",
                                source: "author-contract",
                                contentDigest: contractDigest,
                            },
                        },
                    ];
                },
            },
        });

        const plan = await planner.plan({ candidateId: "candidate-inherited", candidate });

        expect(plan.admission.activeContracts[0]?.ownerVersion).toBe("1.0.0");
        expect(plan.admission.suites.find((suite) => suite.suiteId === "legacy-contract")?.contentDigest).toBe(
            contractDigest,
        );
    });

    test("selects exact reviewed connector migrations for a stateful release", async () => {
        const fixture = registryFixture();
        const dependencyZ = await publicationPackage("z-dependency", "1.0.0");
        const dependencyA = await publicationPackage("a-dependency", "1.0.0", {
            dependencies: [{ name: "Z", kind: "z-dependency", versionRange: "^1.0.0" }],
        });
        await fixture.publisher.publish({ package: dependencyZ });
        await fixture.publisher.publish({ package: dependencyA });
        const baselinePackage = await seedLegacySqlBaseline(fixture);
        await fixture.reviewedSchemaBaselines.append({
            baseline: await reviewedBaseline("baseline-root", {
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
                [{ name: "A", kind: "a-dependency", versionRange: "^1.0.0" }],
            ),
        );
        const store = await validatingCandidate(fixture.root, "candidate-stateful", candidate);
        const basePolicy = await planningPolicy();
        const requestedPolicy = {
            ...basePolicy,
            migrationEvidence: {
                ...basePolicy.migrationEvidence,
                requiredForReleaseLevels: ["minor" as const],
                requiredChecks: ["fresh-install" as const, "migrated-state" as const, "equivalence" as const],
            },
        };
        const { policy, environment } = await planningMigrationConfiguration(requestedPolicy);
        const planner = new FsIntegrationRegistryCandidateAdmissionPlanner({
            snapshots: fixture.snapshots,
            mutations: fixture.mutations,
            candidates: store,
            reviewedSchemaBaselines: fixture.reviewedSchemaBaselines,
            policy,
            migrationEnvironment: environment,
        });

        const plan = await planner.plan({ candidateId: "candidate-stateful", candidate });

        expect(plan.statefulChanges.requiredMigrations).toEqual([
            {
                source: { kind: "demo", version: "1.0.0", packageDigest: baselinePackage.digest },
                connectorKey: "primary",
                lineageId: "demo-supabase-v1",
            },
        ]);
        expect(plan.admission.reviewedBaselines[0]?.baselineDigest).toHaveLength(64);
        expect(plan.migrationInputs).toHaveLength(1);
        expect(plan.migrationInputs[0]).toMatchObject({
            sourceMigrationRevision: 0,
            targetMigrationRevision: 1,
            connectorKey: "primary",
            lineageId: "demo-supabase-v1",
        });
        expect(plan.migrationInputs[0]?.dependencyMatrices).toEqual([
            {
                selection: "minimum",
                dependencies: [
                    { kind: "z-dependency", version: "1.0.0", packageDigest: dependencyZ.digest },
                    { kind: "a-dependency", version: "1.0.0", packageDigest: dependencyA.digest },
                ],
            },
            {
                selection: "stable",
                dependencies: [
                    { kind: "z-dependency", version: "1.0.0", packageDigest: dependencyZ.digest },
                    { kind: "a-dependency", version: "1.0.0", packageDigest: dependencyA.digest },
                ],
            },
        ]);
    });
});
