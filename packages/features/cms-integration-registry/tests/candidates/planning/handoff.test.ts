import { afterEach, describe, expect, test } from "bun:test";
import { FsIntegrationRegistryCandidateAdmissionPlanner } from "@bernouy/cms-integration-registry/fs";
import { identifyCompatibilityReportV2, identifyStatefulChangeSelection } from "@bernouy/cms-integration-verification";
import { cleanupRegistryFixtures, publicationPackage, registryFixture } from "../../publication/fixtures";
import { planningPolicy, validatingCandidate, verificationCandidate } from "./fixtures";

afterEach(cleanupRegistryFixtures);

describe("candidate admission plan handoff", () => {
    test("snapshots optional planning artifacts once before asynchronous queue validation", async () => {
        const fixture = registryFixture();
        const candidate = await verificationCandidate(await publicationPackage("snapshot-demo", "1.0.0"));
        const store = await validatingCandidate(fixture.root, "candidate-snapshot", candidate);
        const planner = new FsIntegrationRegistryCandidateAdmissionPlanner({
            snapshots: fixture.snapshots,
            mutations: fixture.mutations,
            candidates: store,
            reviewedSchemaBaselines: fixture.reviewedSchemaBaselines,
            policy: await planningPolicy(),
        });
        const plan = await planner.plan({ candidateId: "candidate-snapshot", candidate });
        let planningArtifactReads = 0;
        const queueInput = {
            expectedRevision: 1,
            now: "2026-07-26T10:00:02.000Z",
            policy: plan.policy,
            admission: plan.admission,
        };
        Object.defineProperty(queueInput, "planningArtifacts", {
            enumerable: true,
            get() {
                planningArtifactReads += 1;
                return planningArtifactReads === 1 ? plan.planningArtifacts : undefined;
            },
        });

        const queued = await store.queue("candidate-snapshot", queueInput);
        const objects = await store.objects("candidate-snapshot");

        expect(planningArtifactReads).toBe(1);
        expect(queued).toMatchObject({
            status: "queued",
            compatibilityReportDigest: plan.admission.compatibilityRevision.digest,
        });
        expect(objects.compatibilityReport).toEqual(plan.planningArtifacts.compatibilityReport);
        expect(objects.statefulChanges).toEqual(plan.planningArtifacts.statefulChanges);
    });

    test("rejects canonical planning artifacts evaluated by identities outside the exact policy", async () => {
        const fixture = registryFixture();
        const candidate = await verificationCandidate(await publicationPackage("policy-demo", "1.0.0"));
        const store = await validatingCandidate(fixture.root, "candidate-policy", candidate);
        const planner = new FsIntegrationRegistryCandidateAdmissionPlanner({
            snapshots: fixture.snapshots,
            mutations: fixture.mutations,
            candidates: store,
            reviewedSchemaBaselines: fixture.reviewedSchemaBaselines,
            policy: await planningPolicy(),
        });
        const plan = await planner.plan({ candidateId: "candidate-policy", candidate });
        const substitutedReport = await identifyCompatibilityReportV2({
            ...plan.planningArtifacts.compatibilityReport,
            evaluator: { name: "substituted-static-evaluator", version: "9.0.0" },
        });
        const selectionForSubstitutedReport = await identifyStatefulChangeSelection({
            ...plan.planningArtifacts.statefulChanges,
            compatibilityReport: {
                revisionId: substitutedReport.report.reportId,
                reportDigest: substitutedReport.digest,
            },
        });
        const substitutedSelector = await identifyStatefulChangeSelection({
            ...plan.planningArtifacts.statefulChanges,
            selector: { name: "substituted-migration-policy", version: "9.0.0" },
        });
        const cases = [
            {
                admission: {
                    ...plan.admission,
                    compatibilityRevision: {
                        ...plan.admission.compatibilityRevision,
                        digest: substitutedReport.digest,
                    },
                },
                planningArtifacts: {
                    compatibilityReport: substitutedReport.report,
                    compatibilityEvaluatorInputDigest: plan.admission.compatibilityRevision.evaluatorInputDigest,
                    statefulChanges: selectionForSubstitutedReport.selection,
                },
            },
            {
                admission: plan.admission,
                planningArtifacts: {
                    ...plan.planningArtifacts,
                    statefulChanges: substitutedSelector.selection,
                },
            },
        ];

        for (const handoff of cases) {
            await expect(
                store.queue("candidate-policy", {
                    expectedRevision: 1,
                    now: "2026-07-26T10:00:02.000Z",
                    policy: plan.policy,
                    ...handoff,
                }),
            ).rejects.toMatchObject({ code: "invalid_candidate" });
        }
        expect(await store.get("candidate-policy")).toMatchObject({ revision: 1, status: "validating" });
    });
});
