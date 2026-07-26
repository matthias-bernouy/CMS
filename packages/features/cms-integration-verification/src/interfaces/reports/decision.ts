import type { VerificationPolicyIdentity } from "../runner";
import type { CompatibilityReportV2 } from "./compatibility";
import type { ReportProvenance, ReportRevisionDigestReference, VersionDigestReference } from "./common";
import type { MigrationReport } from "./migration";
import type { VerificationReport } from "./verification";

export const RELEASE_ADMISSION_DECISION_SCHEMA = "cms.integration.release-admission-decision.v1" as const;
export const STATEFUL_CHANGE_SELECTION_SCHEMA = "cms.integration.stateful-change-selection.v1" as const;

export type RequiredMigrationEvidence = Readonly<{
    source: VersionDigestReference;
    connectorKey: string;
    lineageId: string;
}>;

export type StatefulChangeSelectionV1 = Readonly<{
    schema: typeof STATEFUL_CHANGE_SELECTION_SCHEMA;
    selector: VerificationPolicyIdentity;
    policySnapshotDigest: string;
    target: VersionDigestReference;
    compatibilityReport: ReportRevisionDigestReference;
    requiredMigrations: readonly RequiredMigrationEvidence[];
}>;

export type IdentifiedStatefulChangeSelectionV1 = Readonly<{
    selection: StatefulChangeSelectionV1;
    canonicalBytes: Uint8Array;
    digest: string;
}>;

export type MigrationReportRevisionDigestReference = ReportRevisionDigestReference &
    Readonly<{
        source: VersionDigestReference;
        connectorKey: string;
        lineageId: string;
        migrationRevision: number;
    }>;

export type ReleaseAdmissionDecision = Readonly<{
    schema: typeof RELEASE_ADMISSION_DECISION_SCHEMA;
    decisionId: string;
    revisionType: "root" | "revision";
    kind: string;
    version: string;
    packageDigest: string;
    compatibilityReport: ReportRevisionDigestReference;
    verificationReport?: ReportRevisionDigestReference;
    migrationReports: readonly MigrationReportRevisionDigestReference[];
    policy: VerificationPolicyIdentity;
    policySnapshotDigest: string;
    statefulChanges: StatefulChangeSelectionV1;
    statefulChangeSelectionDigest: string;
    admissible: boolean;
    reasons: readonly string[];
    createdAt: string;
    supersedes?: string;
    provenance: ReportProvenance;
}>;

export type ComposeReleaseAdmissionDecisionInput = Readonly<{
    decisionId: string;
    revisionType: "root" | "revision";
    supersedes?: string;
    compatibility: CompatibilityReportV2;
    verification?: VerificationReport;
    migrations: readonly MigrationReport[];
    statefulChanges: IdentifiedStatefulChangeSelectionV1;
    policy: VerificationPolicyIdentity;
    policySnapshotDigest: string;
    createdAt: string;
    provenance: ReportProvenance;
}>;
