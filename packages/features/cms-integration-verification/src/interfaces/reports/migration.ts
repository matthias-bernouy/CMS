import type { PinnedVerificationRunnerIdentity, VerificationPolicyIdentity } from "../runner";
import type { ReportHistoryFields, ReportProvenance, VersionDigestReference } from "./common";

export const MIGRATION_REPORT_SCHEMA = "cms.integration.migration-report.v1" as const;

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
    applicable: boolean;
    satisfied: boolean;
    checks: readonly MigrationPolicyEvaluationCheck[];
    reasons: readonly string[];
}>;

export type MigrationReport = ReportHistoryFields &
    Readonly<{
        schema: typeof MIGRATION_REPORT_SCHEMA;
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
