import type {
    IdentifiedStatefulChangeSelectionV1,
    RequiredMigrationEvidence,
} from "../../../../interfaces/reports/decision";
import type { MigrationReport } from "../../../../interfaces/reports/migration";
import type { VerificationPolicyIdentity } from "../../../../interfaces/runner";
import { IntegrationVerificationContractError } from "../../../validation/errors";
import type { identifyCompatibilityReportV2 } from "../../compatibility";
import type { identifyVerificationReport } from "../../verification";

export function assertReportIdentities(
    compatibility: Awaited<ReturnType<typeof identifyCompatibilityReportV2>>["report"],
    verification: Awaited<ReturnType<typeof identifyVerificationReport>>["report"] | undefined,
    migrations: readonly MigrationReport[],
): void {
    if (
        verification &&
        (verification.kind !== compatibility.kind ||
            verification.version !== compatibility.version ||
            verification.packageDigest !== compatibility.packageDigest)
    ) {
        invalid("verification report does not target the compatibility candidate");
    }
    const mismatchedMigration = migrations.find(
        (report) =>
            report.target.kind !== compatibility.kind ||
            report.target.version !== compatibility.version ||
            report.target.packageDigest !== compatibility.packageDigest,
    );
    if (mismatchedMigration) {
        invalid(`migration report ${mismatchedMigration.reportId} does not target the compatibility candidate`);
    }
}

export function assertPolicyBindings(
    policy: VerificationPolicyIdentity,
    policySnapshotDigest: string,
    statefulChangeSelectionDigest: string,
    verification: Awaited<ReturnType<typeof identifyVerificationReport>>["report"] | undefined,
    migrations: readonly MigrationReport[],
): void {
    if (
        verification &&
        (verification.policySnapshotDigest !== policySnapshotDigest || !samePolicy(verification.policy, policy))
    ) {
        invalid("verification report does not cite the selected policy identity and snapshot");
    }
    if (
        migrations.some(
            (report) => report.policySnapshotDigest !== policySnapshotDigest || !samePolicy(report.policy, policy),
        )
    ) {
        invalid("migration report does not cite the selected policy identity and snapshot");
    }
    if (migrations.some((report) => report.statefulChangeSelectionDigest !== statefulChangeSelectionDigest)) {
        invalid("migration report does not cite the trusted stateful-change selection");
    }
}

export function samePolicy(left: VerificationPolicyIdentity, right: VerificationPolicyIdentity): boolean {
    return left.name === right.name && left.version === right.version;
}

export function assertStatefulChangeBindings(
    selection: IdentifiedStatefulChangeSelectionV1,
    policySnapshotDigest: string,
    compatibility: Awaited<ReturnType<typeof identifyCompatibilityReportV2>>,
): void {
    if (
        selection.selection.policySnapshotDigest !== policySnapshotDigest ||
        selection.selection.target.kind !== compatibility.report.kind ||
        selection.selection.target.version !== compatibility.report.version ||
        selection.selection.target.packageDigest !== compatibility.report.packageDigest ||
        selection.selection.compatibilityReport.revisionId !== compatibility.report.reportId ||
        selection.selection.compatibilityReport.reportDigest !== compatibility.digest
    ) {
        invalid("trusted stateful-change selection does not bind the exact compatibility input and target");
    }
}

export function assertUniqueMigrationReports(migrations: readonly MigrationReport[]): void {
    const keys = new Set<string>();
    for (const report of migrations) {
        const key = migrationRequirementKey(report);
        if (keys.has(key)) {
            invalid("migration reports contain duplicate source and connector evidence");
        }
        keys.add(key);
    }
}

export function findRequiredMigration<T extends Readonly<{ report: MigrationReport }>>(
    reports: readonly T[],
    requirement: RequiredMigrationEvidence,
): T | undefined {
    return reports.find(
        ({ report }) =>
            sameVersionReference(report.source, requirement.source) &&
            report.connectorKey === requirement.connectorKey &&
            report.lineageId === requirement.lineageId,
    );
}

export function migrationRequirementKey(requirement: RequiredMigrationEvidence): string {
    return `${requirement.source.kind}@${requirement.source.version}:${requirement.connectorKey}:${requirement.lineageId}`;
}

export function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}

export function invalid(message: string): never {
    throw new IntegrationVerificationContractError("invalid_reference", message, "releaseAdmissionDecision");
}

function sameVersionReference(
    left: RequiredMigrationEvidence["source"],
    right: RequiredMigrationEvidence["source"],
): boolean {
    return left.kind === right.kind && left.version === right.version && left.packageDigest === right.packageDigest;
}
