import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import {
    identifyAdmissionInputSnapshot,
    type AdmissionInputSnapshotV1,
    type ReleaseAdmissionPolicySnapshotV1,
    type VerificationJobResultV1,
} from "@bernouy/cms-integration-verification";
import {
    FsIntegrationCompatibilityV2ReportStore,
    FsIntegrationMigrationReportStore,
    FsIntegrationRegistryCandidateAdmissionPlanner,
    FsIntegrationRegistryCandidateFinalizer,
    FsIntegrationRegistryCandidateStore,
    FsIntegrationVerificationBundleStore,
    FsIntegrationVerificationReportStore,
    FsReleaseAdmissionDecisionStore,
} from "@bernouy/cms-integration-registry/fs";
import { publicationPackage, registryFixture } from "../../publication/fixtures";
import { planningPolicy, validatingCandidate, verificationCandidate } from "../planning/fixtures";

export async function passedCandidate(fixture: ReturnType<typeof registryFixture>, candidateId: string) {
    const candidate = await verificationCandidate(await publicationPackage("demo", "1.0.0"));
    const policy = await planningPolicy();
    return await completePassedCandidate(fixture, candidateId, candidate, policy);
}

export async function completePassedCandidate(
    fixture: ReturnType<typeof registryFixture>,
    candidateId: string,
    candidate: Awaited<ReturnType<typeof verificationCandidate>>,
    policy: ReleaseAdmissionPolicySnapshotV1,
) {
    const store = await validatingCandidate(fixture.root, candidateId, candidate);
    const planner = new FsIntegrationRegistryCandidateAdmissionPlanner({
        snapshots: fixture.snapshots,
        mutations: fixture.mutations,
        candidates: store,
        reviewedSchemaBaselines: fixture.reviewedSchemaBaselines,
        policy,
    });
    const plan = await planner.plan({ candidateId, candidate });
    const queued = await store.queue(candidateId, {
        expectedRevision: 1,
        now: "2026-07-26T10:00:02.000Z",
        policy: plan.policy,
        admission: plan.admission,
    });
    const running = await store.claim(candidateId, {
        expectedRevision: queued.revision,
        jobId: "job-1",
        attemptId: "attempt-1",
        workerId: "worker-1",
        now: "2026-07-26T10:00:03.000Z",
        leaseExpiresAt: "2026-07-26T10:05:03.000Z",
    });
    await store.complete(candidateId, {
        expectedRevision: running.revision,
        now: "2026-07-26T10:00:04.000Z",
        result: await passedResult(plan.admission, running.lease!),
    });
    return { candidate, store, policy, plan };
}

export function releaseStores(fixture: ReturnType<typeof registryFixture>) {
    const config = { root: fixture.root, snapshots: fixture.snapshots, mutations: fixture.mutations };
    const compatibilityReports = new FsIntegrationCompatibilityV2ReportStore(config);
    const verificationReports = new FsIntegrationVerificationReportStore(config);
    const migrationReports = new FsIntegrationMigrationReportStore(config);
    const releaseDecisions = new FsReleaseAdmissionDecisionStore({
        ...config,
        compatibilityReports,
        verificationReports,
        migrationReports,
    });
    return { compatibilityReports, verificationReports, migrationReports, releaseDecisions };
}

export function releaseFinalizer(
    fixture: ReturnType<typeof registryFixture>,
    store: FsIntegrationRegistryCandidateStore,
    policy: Awaited<ReturnType<typeof planningPolicy>>,
) {
    return new FsIntegrationRegistryCandidateFinalizer(finalizerConfig(fixture, store, policy, releaseStores(fixture)));
}

export function finalizerConfig(
    fixture: ReturnType<typeof registryFixture>,
    candidates: FsIntegrationRegistryCandidateStore,
    policy: ReleaseAdmissionPolicySnapshotV1,
    stores: ReturnType<typeof releaseStores>,
) {
    return {
        root: fixture.root,
        snapshots: fixture.snapshots,
        mutations: fixture.mutations,
        compatibility: fixture.compatibility,
        reviewedSchemaBaselines: fixture.reviewedSchemaBaselines,
        candidates,
        policy,
        ...stores,
        verificationBundles: new FsIntegrationVerificationBundleStore(fixture.root),
        now: () => "2026-07-26T10:00:05.000Z",
    };
}

async function passedResult(
    admission: AdmissionInputSnapshotV1,
    lease: Readonly<{ jobId: string; attemptId: string; fencingToken: number }>,
): Promise<VerificationJobResultV1> {
    const versions = [{ name: "postgres", version: "16.4" }];
    return {
        schema: "cms.integration.verification-job-result.v1",
        candidateId: admission.candidate.candidateId,
        jobId: lease.jobId,
        attemptId: lease.attemptId,
        fencingToken: lease.fencingToken,
        bindings: {
            admissionDigest: (await identifyAdmissionInputSnapshot(admission)).digest,
            candidateDigest: admission.candidate.candidateDigest,
            packageDigest: admission.candidate.packageDigest,
            verificationDigest: admission.candidate.verificationDigest,
            policyDigest: admission.policyDigest,
            reviewedBaselineRevisionIds: admission.reviewedBaselines.map(({ revisionId }) => revisionId),
            reviewedBaselineDigests: admission.reviewedBaselines.map(({ baselineDigest }) => baselineDigest),
            reviewedObservedSchemaDigests: admission.reviewedBaselines.map(
                ({ observedSchemaDigest }) => observedSchemaDigest,
            ),
            dependencyDigests: admission.dependencies.map(({ packageDigest }) => packageDigest),
            activeContractDigests: admission.activeContracts.map(({ contractDigest }) => contractDigest),
            suiteContentDigests: admission.suites.map(({ contentDigest }) => contentDigest).toSorted(),
            catalogRevisionDigest: admission.catalogRevision.digest,
            compatibilityRevisionDigest: admission.compatibilityRevision.digest,
            compatibilityEvaluatorInputDigest: admission.compatibilityRevision.evaluatorInputDigest,
        },
        runner: admission.selectedRunner,
        environment: { digest: await sha256Hex(canonicalJsonBytes(versions)), versions },
        results: admission.suites.map(({ suiteId }) => ({
            suiteId,
            outcome: "passed",
            durationMs: 10,
            attempts: 1,
            cacheHit: false,
            evidenceDigests: ["e".repeat(64)],
            diagnostics: [],
        })),
    };
}
