import {
    composeReleaseAdmissionDecision,
    deriveCompatibilityReportAssessment,
    identifyCompatibilityReportV2,
    identifyReleaseAdmissionDecision,
    identifyReleaseAdmissionPolicySnapshot,
    identifyStatefulChangeSelection,
    identifyVerificationReport,
    type ReleaseAdmissionPolicySnapshotV1,
} from "@bernouy/cms-integration-verification";
import type { IntegrationRegistryCatalogSnapshotReference } from "../../../src/core/catalog/reference";
import { InMemoryIntegrationRegistryMutationCoordinator } from "../../../src/core/catalog/mutationCoordinator";
import {
    FsIntegrationCompatibilityV2ReportStore,
    FsIntegrationMigrationReportStore,
    FsIntegrationVerificationReportStore,
    FsReleaseAdmissionDecisionStore,
} from "../../../src/default-implementation/fs/registry/history/evidence";
import { registryFixture } from "../../publication/fixtures";
import { releasePolicy, releaseProvenance, verificationReport } from "../../reports/fixtures/reports";
import { releaseStores } from "../../reports/fixtures/stores";

const CREATED_AT = "2026-07-26T12:00:00.000Z";

export async function appendDecision(
    fixture: ReturnType<typeof registryFixture>,
    version: string,
    options: Readonly<{ admissible?: boolean; id?: string; stores?: ReturnType<typeof releaseStores> }> = {},
) {
    const stores = options.stores ?? releaseStores(fixture);
    const location = fixture.snapshots.current().locateExactVersion("demo", version)!;
    const id = options.id ?? `decision-${version.replaceAll(".", "-")}`;
    const policy = decisionPolicySnapshot();
    const policyDigest = (await identifyReleaseAdmissionPolicySnapshot(policy)).digest;
    const existingCompatibility = await stores.compatibilityReports.get("demo", version);
    const compatibility =
        existingCompatibility?.current ??
        ({
            schema: "cms.integration.compatibility-report.v2" as const,
            reportId: `compatibility-${id}`,
            revisionType: "root" as const,
            origin: "admission" as const,
            createdAt: CREATED_AT,
            kind: "demo",
            version,
            packageDigest: location.package.digest,
            evaluator: { name: "static-compatibility", version: "2.0.0" },
            baselines: [],
            informationalBaselines: [],
            findings: [],
            ...deriveCompatibilityReportAssessment({
                effectiveFindings: [],
                releaseLevel: "initial",
                noBaselineReason: "new-kind",
            }),
            releaseLevel: "initial" as const,
            noBaselineReason: "new-kind" as const,
            provenance: releaseProvenance(),
        } as const);
    const compatibilityIdentity = await identifyCompatibilityReportV2(compatibility);
    const statefulChanges = await identifyStatefulChangeSelection({
        schema: "cms.integration.stateful-change-selection.v1",
        selector: releasePolicy(),
        policySnapshotDigest: policyDigest,
        target: { kind: "demo", version, packageDigest: location.package.digest },
        compatibilityReport: {
            revisionId: compatibility.reportId,
            reportDigest: compatibilityIdentity.digest,
        },
        requiredMigrations: [],
    });
    const verification = verificationReport(location.package.digest, {
        reportId: `verification-${id}`,
        version,
        policySnapshotDigest: policyDigest,
    });
    const decision = await composeReleaseAdmissionDecision({
        decisionId: id,
        revisionType: "root",
        compatibility,
        ...(options.admissible === false ? {} : { verification }),
        migrations: [],
        statefulChanges,
        policy: releasePolicy(),
        policySnapshotDigest: policyDigest,
        createdAt: CREATED_AT,
        provenance: releaseProvenance(),
    });
    if (!existingCompatibility) {
        await stores.compatibilityReports.append({ report: compatibility, expectedCurrent: null });
    }
    if (options.admissible !== false) {
        await stores.verificationReports.append({ report: verification, expectedCurrent: null });
    }
    await stores.decisions.append({ report: decision, expectedCurrent: null });
    const identified = await identifyReleaseAdmissionDecision(decision);
    return { stores, decision, policy, reference: { revisionId: decision.decisionId, digest: identified.digest } };
}

export async function appendAdverseDecisionRevision(
    stores: ReturnType<typeof releaseStores>,
    current: Awaited<ReturnType<typeof appendDecision>>,
) {
    const compatibility = (await stores.compatibilityReports.get("demo", current.decision.version))!.current;
    const verification = await appendAdverseVerificationRevision(stores, current);
    const decision = await composeReleaseAdmissionDecision({
        decisionId: `${current.decision.decisionId}-adverse`,
        revisionType: "revision",
        supersedes: current.decision.decisionId,
        compatibility,
        verification,
        migrations: [],
        statefulChanges: await identifyStatefulChangeSelection(current.decision.statefulChanges),
        policy: releasePolicy(),
        policySnapshotDigest: current.decision.policySnapshotDigest,
        createdAt: "2026-07-26T12:01:00.000Z",
        provenance: releaseProvenance(),
    });
    await stores.decisions.append({
        report: decision,
        expectedCurrent: { revisionId: current.reference.revisionId, reportDigest: current.reference.digest },
    });
    const identified = await identifyReleaseAdmissionDecision(decision);
    return { decision, reference: { revisionId: decision.decisionId, digest: identified.digest } };
}

function decisionPolicySnapshot(): ReleaseAdmissionPolicySnapshotV1 {
    const runner = {
        name: "cms-postgres",
        version: "1.0.0",
        imageDigest: `sha256:${"e".repeat(64)}`,
    } as const;
    return {
        schema: "cms.integration.release-admission-policy.v1" as const,
        identity: { name: "eligibility-test", version: "1.0.0" },
        staticEvaluator: { name: "static-compatibility", version: "2.0.0" },
        verificationPolicy: releasePolicy(),
        migrationPolicy: releasePolicy(),
        approvedRunners: [runner],
        platformRequiredSuites: [{ suiteId: "platform-install-rerun", suiteDigest: "a".repeat(64), runner }],
        findingResolutionRules: [],
        retry: { maximumAttempts: 1, retryableOutcomes: [] },
        cache: { mode: "disabled" as const, minimumConcordantRuns: 1, maximumAgeSeconds: 0 },
        migrationEvidence: {
            requiredForReleaseLevels: ["patch", "minor", "major"],
            requiredChecks: ["fresh-install", "migrated-state", "equivalence"],
            requireExactSourcePackageDigest: true as const,
            requireExactTargetPackageDigest: true as const,
            requireCmsMediatedCutoverEvidence: false,
            requireProviderDirectCutoverEvidence: false,
            requireRollbackEvidence: false,
            requireDelayedCleanupEvidence: false,
        },
    };
}

export async function appendAdverseVerificationRevision(
    stores: ReturnType<typeof releaseStores>,
    current: Awaited<ReturnType<typeof appendDecision>>,
) {
    const verificationHistory = (await stores.verificationReports.get("demo", current.decision.version))!;
    const verification = {
        ...verificationHistory.current,
        reportId: `${verificationHistory.current.reportId}-failed`,
        revisionType: "revision" as const,
        supersedes: verificationHistory.current.reportId,
        createdAt: "2026-07-26T12:01:00.000Z",
        verificationJobResultDigest: "f".repeat(64),
        results: verificationHistory.current.results.map((result) => ({
            ...result,
            outcome: "failed" as const,
            diagnostics: [{ code: "contract-regression", message: "Contract regression", redacted: true as const }],
        })),
        outcome: "failed" as const,
    };
    await stores.verificationReports.append({
        report: verification,
        expectedCurrent: {
            revisionId: verificationHistory.currentRevisionId,
            reportDigest: (await identifyVerificationReport(verificationHistory.current)).digest,
        },
    });
    return verification;
}

export function restartedDecisions(root: string, snapshots: IntegrationRegistryCatalogSnapshotReference) {
    const mutations = new InMemoryIntegrationRegistryMutationCoordinator();
    const config = { root, snapshots, mutations };
    const compatibilityReports = new FsIntegrationCompatibilityV2ReportStore(config);
    const verificationReports = new FsIntegrationVerificationReportStore(config);
    const migrationReports = new FsIntegrationMigrationReportStore(config);
    return new FsReleaseAdmissionDecisionStore({
        ...config,
        compatibilityReports,
        verificationReports,
        migrationReports,
    });
}
