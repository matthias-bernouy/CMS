import type { PinnedVerificationRunnerIdentity, VerificationPolicyIdentity } from "../runner";
import type { ReportHistoryFields, ReportProvenance, VersionDigestReference } from "./common";

export const MIGRATION_REPORT_SCHEMA = "cms.integration.migration-report.v1" as const;
export const MIGRATION_REPORT_V2_SCHEMA = "cms.integration.migration-report.v2" as const;

export type MigrationCheckResult = Readonly<{
    outcome: "passed" | "failed" | "not-supported" | "not-applicable" | "infrastructure-failure";
    evidenceDigest?: string;
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

export type MigrationReport = LegacyMigrationReportV1 | MigrationReportV2;
