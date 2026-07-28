import type { CompatibilityFinding, CompatibilityFindingClassification } from "../finding";
import type { VerificationPolicyIdentity } from "../runner";
import type { ReportHistoryFields, ReportProvenance, VersionDigestReference } from "./common";

export const COMPATIBILITY_REPORT_V2_SCHEMA = "cms.integration.compatibility-report.v2" as const;

export type CompatibilityReportOutcome = Exclude<CompatibilityFindingClassification, "additive"> | "not-applicable";
export type CompatibilityRequiredReleaseLevel = "none" | "patch" | "minor" | "major";
export type CompatibilityReleaseLevel = "initial" | "patch" | "minor" | "major";
export type CompatibilityNoBaselineReason = "new-kind" | "new-major";
export type CompatibilityReportAssessment = Readonly<{
    outcome: CompatibilityReportOutcome;
    requiredReleaseLevel: CompatibilityRequiredReleaseLevel;
    contractAdmissible: boolean;
}>;

export type CompatibilityReportV2 = ReportHistoryFields &
    Readonly<{
        schema: typeof COMPATIBILITY_REPORT_V2_SCHEMA;
        kind: string;
        version: string;
        packageDigest: string;
        evaluator: VerificationPolicyIdentity;
        baselines: readonly VersionDigestReference[];
        informationalBaselines: readonly VersionDigestReference[];
        /**
         * Effective evaluator findings used to derive the assessment fields below.
         *
         * V2 deliberately does not embed external resolution proofs: replaying one
         * safely also requires its allowlisted resolution policy. Exact proofs stay
         * in the separate finding-resolution contract until a report schema can
         * persist and revalidate both artifacts together.
         */
        findings: readonly CompatibilityFinding[];
        outcome: CompatibilityReportOutcome;
        requiredReleaseLevel: CompatibilityRequiredReleaseLevel;
        releaseLevel: CompatibilityReleaseLevel;
        contractAdmissible: boolean;
        noBaselineReason?: CompatibilityNoBaselineReason;
        provenance: ReportProvenance;
    }>;
