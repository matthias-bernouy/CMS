import type { PinnedVerificationRunnerIdentity, VerificationPolicyIdentity } from "../runner";
import type { AdmissionDependencyReferenceV1, AdmissionReviewedBaselineReferenceV1 } from "../verification/admission";
import type { PlatformVerificationEvidenceV1 } from "../verification/platform";
import type { DigestContractReference, ReportHistoryFields, ReportProvenance } from "./common";

export const VERIFICATION_REPORT_SCHEMA = "cms.integration.verification-report.v1" as const;

export type VerificationSuiteResult = Readonly<{
    suiteId: string;
    source: "platform" | "author-contract" | "author-conformance";
    required: boolean;
    applicable?: boolean;
    outcome: "passed" | "failed" | "skipped" | "not-applicable" | "infrastructure-failure";
    durationMs: number;
    attempts: number;
    cacheHit: boolean;
    evidenceDigests: readonly string[];
    diagnostics: readonly Readonly<{
        code: string;
        message: string;
        redacted: true;
    }>[];
    platformEvidence?: PlatformVerificationEvidenceV1;
}>;

export type VerificationReport = ReportHistoryFields &
    Readonly<{
        schema: typeof VERIFICATION_REPORT_SCHEMA;
        kind: string;
        version: string;
        packageDigest: string;
        verificationDigest: string;
        runner: PinnedVerificationRunnerIdentity;
        policy: VerificationPolicyIdentity;
        policySnapshotDigest: string;
        admissionInputDigest: string;
        verificationJobResultDigest: string;
        dependencies: readonly AdmissionDependencyReferenceV1[];
        baselines: readonly AdmissionReviewedBaselineReferenceV1[];
        activeContracts: readonly DigestContractReference[];
        environment: Readonly<{
            digest: string;
            versions: Readonly<Record<string, string>>;
        }>;
        results: readonly VerificationSuiteResult[];
        outcome: "passed" | "failed" | "infrastructure-failure";
        provenance: ReportProvenance;
    }>;
