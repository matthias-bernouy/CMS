import { canonicalJsonBytes, type ResolvedIntegrationPackage } from "@bernouy/cms-integration-packages";
import type { PreparedIntegrationVerificationBackfill } from "@bernouy/cms-integration-registry";
import type {
    CompatibilityReportV2,
    ReleaseAdmissionDecision,
    StatefulChangeSelectionV1,
    VerificationReport,
} from "@bernouy/cms-integration-verification";
import { createHash } from "node:crypto";

export function verificationBackfill(
    integrationPackage: ResolvedIntegrationPackage,
): PreparedIntegrationVerificationBackfill {
    const kind = integrationPackage.envelope.kind;
    const version = integrationPackage.envelope.version;
    const packageDigest = integrationPackage.digest;
    const policy = { name: "backfill-test", version: "1.0.0" } as const;
    const policySnapshotDigest = "d".repeat(64);
    const verificationEnvelope = {
        schema: "cms.integration.verification.v1" as const,
        target: { kind, version, packageDigest },
        manifest: {
            runnerRequirements: [{ name: "backfill-test", versionRange: "1.0.0" }],
            contracts: [],
            conformance: [],
            fixtures: [],
        },
        files: {},
    };
    const verificationDigest = syncDigest(verificationEnvelope);
    const compatibilityReport: CompatibilityReportV2 = {
        schema: "cms.integration.compatibility-report.v2",
        reportId: `compatibility-${kind}`,
        revisionType: "root",
        origin: "legacy-backfill",
        createdAt: "2026-07-26T10:00:00.000Z",
        kind,
        version,
        packageDigest,
        evaluator: { name: "backfill-test-compatibility", version: "1.0.0" },
        baselines: [],
        informationalBaselines: [],
        findings: [],
        outcome: "not-applicable",
        requiredReleaseLevel: "none",
        releaseLevel: "initial",
        contractAdmissible: true,
        noBaselineReason: "new-kind",
        provenance: { actor: "backfill-test", reason: "Initial fixture version." },
    };
    const compatibilityDigest = syncDigest(compatibilityReport);
    const statefulChanges: StatefulChangeSelectionV1 = {
        schema: "cms.integration.stateful-change-selection.v1",
        selector: policy,
        policySnapshotDigest,
        target: { kind, version, packageDigest },
        compatibilityReport: { revisionId: compatibilityReport.reportId, reportDigest: compatibilityDigest },
        requiredMigrations: [],
    };
    const statefulChangeSelectionDigest = syncDigest(statefulChanges);
    const result = {
        suiteId: "package-contract-validation",
        source: "platform" as const,
        required: true,
        outcome: "passed" as const,
        durationMs: 0,
        attempts: 1,
        cacheHit: false,
        evidenceDigests: [packageDigest],
        diagnostics: [],
    };
    const verificationReport: VerificationReport = {
        schema: "cms.integration.verification-report.v1",
        reportId: `verification-${kind}`,
        revisionType: "root",
        origin: "legacy-backfill",
        createdAt: "2026-07-26T10:00:00.000Z",
        kind,
        version,
        packageDigest,
        verificationDigest,
        runner: { name: "backfill-test", version: "1.0.0", imageDigest: `sha256:${"a".repeat(64)}` },
        policy,
        policySnapshotDigest,
        admissionInputDigest: "a".repeat(64),
        verificationJobResultDigest: syncDigest([result]),
        dependencies: [],
        baselines: [],
        activeContracts: [],
        environment: { digest: "b".repeat(64), versions: { bun: "1.3.14" } },
        results: [result],
        outcome: "passed",
        provenance: { actor: "backfill-test", reason: "Strict package fixture validation." },
    };
    const verificationReportDigest = syncDigest(verificationReport);
    const decision: ReleaseAdmissionDecision = {
        schema: "cms.integration.release-admission-decision.v1",
        decisionId: `decision-${kind}`,
        revisionType: "root",
        kind,
        version,
        packageDigest,
        compatibilityReport: { revisionId: compatibilityReport.reportId, reportDigest: compatibilityDigest },
        verificationReport: { revisionId: verificationReport.reportId, reportDigest: verificationReportDigest },
        migrationReports: [],
        policy,
        policySnapshotDigest,
        statefulChanges,
        statefulChangeSelectionDigest,
        admissible: true,
        reasons: [],
        createdAt: "2026-07-26T10:00:00.000Z",
        provenance: { actor: "backfill-test", reason: "Exact fixture decision." },
    };
    return {
        verification: {
            envelope: verificationEnvelope,
            canonicalBytes: canonicalJsonBytes(verificationEnvelope),
            digest: verificationDigest,
        },
        compatibilityReport,
        verificationReport,
        statefulChanges,
        decision,
    };
}

function syncDigest(value: unknown): string {
    return createHash("sha256").update(canonicalJsonBytes(value)).digest("hex");
}
