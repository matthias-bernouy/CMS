import { createHash } from "node:crypto";
import { canonicalJsonBytes, type ResolvedIntegrationPackage } from "@bernouy/cms-integration-packages";
import {
    INTEGRATION_VERIFICATION_BACKFILL_SCHEMA,
    type IntegrationVerificationBackfillRequest,
} from "@bernouy/cms-integration-registry";
import type {
    CompatibilityReportV2,
    IntegrationVerificationEnvelopeV1,
    ReleaseAdmissionDecision,
    StatefulChangeSelectionV1,
    VerificationReport,
    VerificationSuiteResult,
} from "@bernouy/cms-integration-verification";

export function legacyBackfillRequest(
    integrationPackage: ResolvedIntegrationPackage,
): IntegrationVerificationBackfillRequest {
    const { kind, version } = integrationPackage.envelope;
    const packageDigest = integrationPackage.digest;
    const policy = { name: "repository-hub-fixture", version: "1.0.0" } as const;
    const verification = verificationEnvelope(kind, version, packageDigest);
    const verificationDigest = digest(verification);
    const compatibilityReport: CompatibilityReportV2 = {
        schema: "cms.integration.compatibility-report.v2",
        reportId: `repository-hub-${kind}-compatibility`,
        revisionType: "root",
        origin: "legacy-backfill",
        createdAt: "2026-07-26T10:00:00.000Z",
        kind,
        version,
        packageDigest,
        evaluator: policy,
        baselines: [],
        informationalBaselines: [],
        findings: [],
        outcome: "not-applicable",
        requiredReleaseLevel: "none",
        releaseLevel: "initial",
        contractAdmissible: true,
        noBaselineReason: "new-kind",
        provenance: { actor: "repository-hub-fixture", reason: "Deterministic acceptance history." },
    };
    const results: VerificationSuiteResult[] = [
        {
            suiteId: "package-contract-validation",
            source: "platform",
            required: true,
            outcome: "passed",
            durationMs: 0,
            attempts: 1,
            cacheHit: false,
            evidenceDigests: [packageDigest],
            diagnostics: [],
        },
    ];
    const verificationReport: VerificationReport = {
        schema: "cms.integration.verification-report.v1",
        reportId: `repository-hub-${kind}-verification`,
        revisionType: "root",
        origin: "legacy-backfill",
        createdAt: "2026-07-26T10:00:00.000Z",
        kind,
        version,
        packageDigest,
        verificationDigest,
        runner: { name: "repository-hub-fixture", version: "1.0.0", imageDigest: `sha256:${"a".repeat(64)}` },
        policy,
        policySnapshotDigest: "b".repeat(64),
        admissionInputDigest: "c".repeat(64),
        verificationJobResultDigest: digest(results),
        dependencies: [],
        baselines: [],
        activeContracts: [],
        environment: { digest: "d".repeat(64), versions: { bun: "1.3.9" } },
        results,
        outcome: "passed",
        provenance: { actor: "repository-hub-fixture", reason: "Deterministic acceptance verification." },
    };
    const statefulChanges: StatefulChangeSelectionV1 = {
        schema: "cms.integration.stateful-change-selection.v1",
        selector: policy,
        policySnapshotDigest: verificationReport.policySnapshotDigest,
        target: { kind, version, packageDigest },
        compatibilityReport: {
            revisionId: compatibilityReport.reportId,
            reportDigest: digest(compatibilityReport),
        },
        requiredMigrations: [],
    };
    const decision: ReleaseAdmissionDecision = {
        schema: "cms.integration.release-admission-decision.v1",
        decisionId: `repository-hub-${kind}-decision`,
        revisionType: "root",
        kind,
        version,
        packageDigest,
        compatibilityReport: statefulChanges.compatibilityReport,
        verificationReport: {
            revisionId: verificationReport.reportId,
            reportDigest: digest(verificationReport),
        },
        migrationReports: [],
        policy,
        policySnapshotDigest: verificationReport.policySnapshotDigest,
        statefulChanges,
        statefulChangeSelectionDigest: digest(statefulChanges),
        admissible: true,
        reasons: [],
        createdAt: "2026-07-26T10:00:00.000Z",
        provenance: { actor: "repository-hub-fixture", reason: "Deterministic acceptance admission." },
    };
    return {
        schema: INTEGRATION_VERIFICATION_BACKFILL_SCHEMA,
        verification: { envelope: verification, digest: verificationDigest },
        compatibilityReport,
        verificationReport,
        statefulChanges,
        decision,
    };
}

function verificationEnvelope(kind: string, version: string, packageDigest: string): IntegrationVerificationEnvelopeV1 {
    return {
        schema: "cms.integration.verification.v1",
        target: { kind, version, packageDigest },
        manifest: {
            runnerRequirements: [{ name: "repository-hub-fixture", versionRange: "1.0.0" }],
            contracts: [],
            conformance: [],
            fixtures: [],
        },
        files: {},
    };
}

function digest(value: unknown): string {
    return createHash("sha256").update(canonicalJsonBytes(value)).digest("hex");
}
