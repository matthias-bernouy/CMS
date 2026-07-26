import type { VerificationPolicyIdentity } from "../runner";
import type { ReportProvenance } from "./common";

export const RELEASE_ADMISSION_DECISION_SCHEMA = "cms.integration.release-admission-decision.v1" as const;

export type ReleaseAdmissionDecision = Readonly<{
    schema: typeof RELEASE_ADMISSION_DECISION_SCHEMA;
    decisionId: string;
    revisionType: "root" | "revision";
    kind: string;
    version: string;
    packageDigest: string;
    compatibilityReportRevisionId: string;
    verificationReportRevisionId?: string;
    migrationReportRevisionIds: readonly string[];
    policy: VerificationPolicyIdentity;
    admissible: boolean;
    reasons: readonly string[];
    createdAt: string;
    supersedes?: string;
    provenance: ReportProvenance;
}>;
