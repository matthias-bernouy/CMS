import type { CompatibilityFinding, CompatibilityFindingClassification } from "../finding";
import type { VerificationPolicyIdentity } from "../runner";
import type { ReportHistoryFields, ReportProvenance, VersionDigestReference } from "./common";

export const COMPATIBILITY_REPORT_V2_SCHEMA = "cms.integration.compatibility-report.v2" as const;

export type CompatibilityReportV2 = ReportHistoryFields &
    Readonly<{
        schema: typeof COMPATIBILITY_REPORT_V2_SCHEMA;
        kind: string;
        version: string;
        packageDigest: string;
        evaluator: VerificationPolicyIdentity;
        baselines: readonly VersionDigestReference[];
        informationalBaselines: readonly VersionDigestReference[];
        findings: readonly CompatibilityFinding[];
        outcome: Exclude<CompatibilityFindingClassification, "additive"> | "not-applicable";
        requiredReleaseLevel: "none" | "patch" | "minor" | "major";
        releaseLevel: "initial" | "patch" | "minor" | "major";
        contractAdmissible: boolean;
        noBaselineReason?: "new-kind" | "new-major";
        provenance: ReportProvenance;
    }>;
