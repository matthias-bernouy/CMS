import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { FsIntegrationRegistryCandidateAdmissionPlanner } from "@bernouy/cms-integration-registry/fs";
import { reviewedBaseline } from "../../baselines/fixtures";
import {
    cleanupRegistryFixtures,
    publicationPackage,
    registryFixture,
    reviewedSchemaContract,
    seedLegacySqlBaseline,
    sqlPublicationPackage,
} from "../../publication/fixtures";
import { planningPolicy, validatingCandidate, verificationCandidate } from "./fixtures";

afterEach(cleanupRegistryFixtures);

describe("candidate admission planning fail-closed checks", () => {
    test("rejects duplicate and out-of-order versions before persisting a plan", async () => {
        const fixture = registryFixture();
        await fixture.publisher.publish({ package: await publicationPackage("demo", "1.0.0") });
        for (const version of ["1.0.0", "0.9.0"]) {
            const candidate = await verificationCandidate(await publicationPackage("demo", version));
            const candidateId = `candidate-order-${version}`;
            const store = await validatingCandidate(fixture.root, candidateId, candidate);
            const planner = new FsIntegrationRegistryCandidateAdmissionPlanner({
                snapshots: fixture.snapshots,
                mutations: fixture.mutations,
                candidates: store,
                reviewedSchemaBaselines: fixture.reviewedSchemaBaselines,
                policy: await planningPolicy(),
            });

            await expect(planner.plan({ candidateId, candidate })).rejects.toThrow(/version|already exists/i);
            expect((await store.get(candidateId))?.status).toBe("validating");
        }
    });

    test("rejects an unresolved required dependency and exact catalog drift", async () => {
        const fixture = registryFixture();
        const unavailable = await publicationPackage("demo", "1.0.0", {
            dependencies: [{ name: "missing", kind: "missing", versionRange: "^1.0.0" }],
        });
        const first = await verificationCandidate(unavailable);
        const firstStore = await validatingCandidate(fixture.root, "candidate-dependency", first);
        const firstPlanner = new FsIntegrationRegistryCandidateAdmissionPlanner({
            snapshots: fixture.snapshots,
            mutations: fixture.mutations,
            candidates: firstStore,
            reviewedSchemaBaselines: fixture.reviewedSchemaBaselines,
            policy: await planningPolicy(),
        });
        await expect(
            firstPlanner.plan({ candidateId: "candidate-dependency", candidate: first }),
        ).rejects.toMatchObject({
            code: "dependency_unavailable",
        });

        const second = await verificationCandidate(await publicationPackage("other", "1.0.0"));
        const secondStore = await validatingCandidate(fixture.root, "candidate-catalog", second);
        const secondPlanner = new FsIntegrationRegistryCandidateAdmissionPlanner({
            snapshots: fixture.snapshots,
            mutations: fixture.mutations,
            candidates: secondStore,
            reviewedSchemaBaselines: fixture.reviewedSchemaBaselines,
            policy: await planningPolicy(),
            inheritedContracts: {
                async listActive() {
                    await fixture.publisher.publish({ package: await publicationPackage("racer", "1.0.0") });
                    return [];
                },
            },
        });
        await expect(secondPlanner.plan({ candidateId: "candidate-catalog", candidate: second })).rejects.toEqual(
            expect.objectContaining({ code: "catalog_changed" }),
        );
    });

    test("rejects a reviewed schema baseline revision changed during planning", async () => {
        const fixture = registryFixture();
        const baselinePackage = await seedLegacySqlBaseline(fixture);
        const root = await reviewedBaseline("baseline-root", {
            kind: "demo",
            packageDigest: baselinePackage.digest,
        });
        await fixture.reviewedSchemaBaselines.append({ baseline: root, expectedCurrentRevisionId: null });
        const candidate = await verificationCandidate(
            await sqlPublicationPackage("demo", "1.0.1", reviewedSchemaContract()),
        );
        const store = await validatingCandidate(fixture.root, "candidate-baseline", candidate);
        const planner = new FsIntegrationRegistryCandidateAdmissionPlanner({
            snapshots: fixture.snapshots,
            mutations: fixture.mutations,
            candidates: store,
            reviewedSchemaBaselines: fixture.reviewedSchemaBaselines,
            policy: await planningPolicy(),
            inheritedContracts: {
                async listActive() {
                    await fixture.reviewedSchemaBaselines.append({
                        baseline: await reviewedBaseline("baseline-revision", {
                            kind: "demo",
                            packageDigest: baselinePackage.digest,
                            supersedes: root.reportId,
                            reason: "Concurrent review",
                        }),
                        expectedCurrentRevisionId: root.reportId,
                    });
                    return [];
                },
            },
        });

        await expect(planner.plan({ candidateId: "candidate-baseline", candidate })).rejects.toMatchObject({
            code: "catalog_changed",
        });
    });

    test("rejects a substituted admission plan and a stale candidate CAS before writing objects", async () => {
        const fixture = registryFixture();
        const candidate = await verificationCandidate(await publicationPackage("demo", "1.0.0"));
        const store = await validatingCandidate(fixture.root, "candidate-tamper", candidate);
        const planner = new FsIntegrationRegistryCandidateAdmissionPlanner({
            snapshots: fixture.snapshots,
            mutations: fixture.mutations,
            candidates: store,
            reviewedSchemaBaselines: fixture.reviewedSchemaBaselines,
            policy: await planningPolicy(),
        });
        const plan = await planner.plan({ candidateId: "candidate-tamper", candidate });
        const reportPath = join(
            fixture.root,
            ".registry",
            "candidates",
            "objects",
            "compatibility-reports",
            `${plan.admission.compatibilityRevision.digest}.json`,
        );

        await expect(
            store.queue("candidate-tamper", {
                expectedRevision: 1,
                now: "2026-07-26T10:00:02.000Z",
                policy: plan.policy,
                admission: plan.admission,
                planningArtifacts: {
                    ...plan.planningArtifacts,
                    compatibilityEvaluatorInputDigest: "0".repeat(64),
                },
            }),
        ).rejects.toThrow();
        expect((await store.get("candidate-tamper"))?.status).toBe("validating");
        expect(existsSync(reportPath)).toBeFalse();

        const second = await verificationCandidate(await publicationPackage("other", "1.0.0"));
        const secondStore = await validatingCandidate(fixture.root, "candidate-cas", second);
        const secondPlanner = new FsIntegrationRegistryCandidateAdmissionPlanner({
            snapshots: fixture.snapshots,
            mutations: fixture.mutations,
            candidates: secondStore,
            reviewedSchemaBaselines: fixture.reviewedSchemaBaselines,
            policy: await planningPolicy(),
        });
        const secondPlan = await secondPlanner.plan({ candidateId: "candidate-cas", candidate: second });
        const secondReportPath = join(
            fixture.root,
            ".registry",
            "candidates",
            "objects",
            "compatibility-reports",
            `${secondPlan.admission.compatibilityRevision.digest}.json`,
        );
        await secondStore.expire("candidate-cas", 1, "2026-07-27T10:00:00.000Z");
        await expect(
            secondStore.queue("candidate-cas", {
                expectedRevision: 1,
                now: "2026-07-27T10:00:01.000Z",
                policy: secondPlan.policy,
                admission: secondPlan.admission,
                planningArtifacts: secondPlan.planningArtifacts,
            }),
        ).rejects.toMatchObject({ code: "revision_conflict" });
        expect(existsSync(secondReportPath)).toBeFalse();
    });
});
