import type { PinnedVerificationRunnerIdentity, VerificationPolicyIdentity } from "../runner";
import type { ReportHistoryFields, ReportProvenance, VersionDigestReference } from "./common";

export const MIGRATION_REPORT_SCHEMA = "cms.integration.migration-report.v1" as const;
export const MIGRATION_REPORT_V2_SCHEMA = "cms.integration.migration-report.v2" as const;
export const MIGRATION_REPORT_V3_SCHEMA = "cms.integration.migration-report.v3" as const;
export const MIGRATION_REPORT_V4_SCHEMA = "cms.integration.migration-report.v4" as const;

export type MigrationCheckResult = Readonly<{
    outcome: "passed" | "failed" | "not-supported" | "not-applicable" | "infrastructure-failure";
    evidenceDigest?: string;
}>;

export type MigrationCutoverEvidence = Readonly<{
    cmsMediated: MigrationCheckResult;
    providerDirect: MigrationCheckResult;
    activation: MigrationCheckResult;
}>;

export type MigrationPolicyEvaluationCheck = Readonly<{
    check:
        | "report-outcome"
        | "environment"
        | "fresh-install"
        | "migrated-state"
        | "equivalence"
        | "failure-injection"
        | "resumption"
        | "cms-mediated-cutover"
        | "provider-direct-cutover"
        | "rollback"
        | "delayed-cleanup";
    applicable: boolean;
    satisfied: boolean;
    observed: string | boolean;
    reason?: string;
}>;

export type MigrationReportPolicyEvaluation = Readonly<{
    releaseLevel: "initial" | "patch" | "minor" | "major";
    applicable: boolean;
    satisfied: boolean;
    checks: readonly MigrationPolicyEvaluationCheck[];
    reasons: readonly string[];
}>;

export type MigrationOperationalEvidence = Readonly<{
    downtime:
        | Readonly<{ status: "not-measured" }>
        | Readonly<{
              status: "zero-downtime" | "bounded-downtime";
              observedSeconds: number;
              evidenceDigest: string;
          }>;
    drain: Readonly<{
        cmsMediatedSeconds?: number;
        providerDirectSeconds?: number;
    }>;
    rollback: Readonly<{
        capability: "available" | "unavailable" | "not-applicable";
        verified: boolean;
        evidenceDigest?: string;
    }>;
    pointOfNoReturn: Readonly<{
        phase: string;
        observation: "crossed" | "not-crossed" | "not-observed";
        evidenceDigest?: string;
    }>;
    cleanup: Readonly<{
        delaySeconds?: number;
        observed: boolean;
        evidenceDigest?: string;
    }>;
}>;

type MigrationReportFields = ReportHistoryFields &
    Readonly<{
        source: VersionDigestReference;
        target: VersionDigestReference;
        connectorKey: string;
        lineageId: string;
        migrationRevision: number;
        supportedSourceRange: string;
        runner: PinnedVerificationRunnerIdentity;
        policy: VerificationPolicyIdentity;
        policySnapshotDigest: string;
        migrationInputDigest: string;
        migrationJobResultDigest: string;
        statefulChangeSelectionDigest: string;
        environmentDigest: string;
        checks: Readonly<{
            freshInstall: MigrationCheckResult;
            migratedState: MigrationCheckResult;
            equivalence: MigrationCheckResult;
            failureInjection: MigrationCheckResult;
            resumption: MigrationCheckResult;
        }>;
        cutover: Readonly<{
            cmsMediated: "binding-revision" | "expand-in-code" | "not-applicable";
            providerDirect: "provider-cutover" | "expand-in-code" | "not-applicable";
        }>;
        rollback: "available" | "unavailable" | "not-applicable";
        pointOfNoReturn: string;
        delayedCleanupVerified: boolean;
        outcome: "passed" | "failed" | "infrastructure-failure";
        provenance: ReportProvenance;
    }>;

export type LegacyMigrationReportV1 = MigrationReportFields &
    Readonly<{
        schema: typeof MIGRATION_REPORT_SCHEMA;
    }>;

export type MigrationReportV2 = MigrationReportFields &
    Readonly<{
        schema: typeof MIGRATION_REPORT_V2_SCHEMA;
        policyEvaluation: MigrationReportPolicyEvaluation;
    }>;

export type MigrationReportV3 = MigrationReportFields &
    Readonly<{
        schema: typeof MIGRATION_REPORT_V3_SCHEMA;
        policyEvaluation: MigrationReportPolicyEvaluation;
        operationalEvidence: MigrationOperationalEvidence;
    }>;

export type MigrationReportV4 = MigrationReportFields &
    Readonly<{
        schema: typeof MIGRATION_REPORT_V4_SCHEMA;
        policyEvaluation: MigrationReportPolicyEvaluation;
        operationalEvidence: MigrationOperationalEvidence;
        cutoverEvidence: MigrationCutoverEvidence;
    }>;

export type MigrationReport = LegacyMigrationReportV1 | MigrationReportV2 | MigrationReportV3 | MigrationReportV4;
