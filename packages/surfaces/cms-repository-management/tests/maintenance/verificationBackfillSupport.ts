import { createHash } from "node:crypto";
import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import {
    identifyIntegrationVerificationBackfillRequest,
    INTEGRATION_VERIFICATION_BACKFILL_SCHEMA,
    type IntegrationVerificationBackfillRequest,
} from "@bernouy/cms-integration-registry";
import type {
    CompatibilityReportV2,
    ReleaseAdmissionDecision,
    StatefulChangeSelectionV1,
    VerificationReport,
} from "@bernouy/cms-integration-verification";

export async function verificationBackfillBody(): Promise<IntegrationVerificationBackfillRequest> {
    const packageDigest = "a".repeat(64);
    const policy = { name: "legacy-backfill", version: "1.0.0" } as const;
    const policySnapshotDigest = "b".repeat(64);
    const envelope = {
        schema: "cms.integration.verification.v1" as const,
        target: { kind: "demo", version: "1.0.0", packageDigest },
        manifest: {
            runnerRequirements: [{ name: "cms-static", versionRange: "1.0.0" }],
            contracts: [],
            conformance: [],
            fixtures: [],
        },
        files: {},
    };
    const verificationDigest = digest(envelope);
    const compatibilityReport: CompatibilityReportV2 = {
        schema: "cms.integration.compatibility-report.v2",
        reportId: "compatibility-demo",
        revisionType: "root",
        origin: "legacy-backfill",
        createdAt: "2026-07-26T12:00:00.000Z",
        kind: "demo",
        version: "1.0.0",
        packageDigest,
        evaluator: { name: "legacy-compatibility", version: "1.0.0" },
        baselines: [],
        informationalBaselines: [],
        findings: [],
        outcome: "not-applicable",
        requiredReleaseLevel: "none",
        releaseLevel: "initial",
        contractAdmissible: true,
        noBaselineReason: "new-kind",
        provenance: { actor: "official-integrations-ci", reason: "Legacy backfill" },
    };
    const statefulChanges: StatefulChangeSelectionV1 = {
        schema: "cms.integration.stateful-change-selection.v1",
        selector: policy,
        policySnapshotDigest,
        target: { kind: "demo", version: "1.0.0", packageDigest },
        compatibilityReport: {
            revisionId: compatibilityReport.reportId,
            reportDigest: digest(compatibilityReport),
        },
        requiredMigrations: [],
    };
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
        reportId: "verification-demo",
        revisionType: "root",
        origin: "legacy-backfill",
        createdAt: "2026-07-26T12:00:00.000Z",
        kind: "demo",
        version: "1.0.0",
        packageDigest,
        verificationDigest,
        runner: { name: "cms-static", version: "1.0.0", imageDigest: `sha256:${"c".repeat(64)}` },
        policy,
        policySnapshotDigest,
        admissionInputDigest: "d".repeat(64),
        verificationJobResultDigest: digest([result]),
        dependencies: [],
        baselines: [],
        activeContracts: [],
        environment: { digest: "e".repeat(64), versions: { bun: "1.3.14" } },
        results: [result],
        outcome: "passed",
        provenance: { actor: "official-integrations-ci", reason: "Legacy backfill" },
    };
    const decision: ReleaseAdmissionDecision = {
        schema: "cms.integration.release-admission-decision.v1",
        decisionId: "decision-demo",
        revisionType: "root",
        kind: "demo",
        version: "1.0.0",
        packageDigest,
        compatibilityReport: {
            revisionId: compatibilityReport.reportId,
            reportDigest: digest(compatibilityReport),
        },
        verificationReport: { revisionId: verificationReport.reportId, reportDigest: digest(verificationReport) },
        migrationReports: [],
        policy,
        policySnapshotDigest,
        statefulChanges,
        statefulChangeSelectionDigest: digest(statefulChanges),
        admissible: true,
        reasons: [],
        createdAt: "2026-07-26T12:00:00.000Z",
        provenance: { actor: "official-integrations-ci", reason: "Legacy backfill" },
    };
    return (
        await identifyIntegrationVerificationBackfillRequest({
            schema: INTEGRATION_VERIFICATION_BACKFILL_SCHEMA,
            verification: { envelope, digest: verificationDigest },
            compatibilityReport,
            verificationReport,
            statefulChanges,
            decision,
        })
    ).request;
}

function digest(value: unknown): string {
    return createHash("sha256").update(canonicalJsonBytes(value)).digest("hex");
}
