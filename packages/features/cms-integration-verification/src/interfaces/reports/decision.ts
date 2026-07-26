import type { VerificationPolicyIdentity } from "../runner";
import type { CompatibilityReportV2 } from "./compatibility";
import type { ReportProvenance } from "./common";
import type { VersionDigestReference } from "./common";
import type { MigrationReport } from "./migration";
import type { VerificationReport } from "./verification";

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

export type RequiredMigrationEvidence = Readonly<{
    source: VersionDigestReference;
    connectorKey: string;
    lineageId: string;
}>;

export type ComposeReleaseAdmissionDecisionInput = Readonly<{
    decisionId: string;
    revisionType: "root" | "revision";
    supersedes?: string;
    compatibility: CompatibilityReportV2;
    verification?: VerificationReport;
    migrations: readonly MigrationReport[];
    requiredMigrations: readonly RequiredMigrationEvidence[];
    policy: VerificationPolicyIdentity;
    createdAt: string;
    provenance: ReportProvenance;
}>;
