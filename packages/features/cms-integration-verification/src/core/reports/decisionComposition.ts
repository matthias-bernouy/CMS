import type {
    ComposeReleaseAdmissionDecisionInput,
    ReleaseAdmissionDecision,
    RequiredMigrationEvidence,
} from "../../interfaces/reports/decision";
import type { MigrationReport } from "../../interfaces/reports/migration";
import { parseCompatibilityReportV2 } from "./compatibility";
import { parseReleaseAdmissionDecision } from "./decision";
import { parseMigrationReport } from "./migration";
import { parseVerificationReport } from "./verification";
import { IntegrationVerificationContractError } from "../validation/errors";

export async function composeReleaseAdmissionDecision(
    input: ComposeReleaseAdmissionDecisionInput,
): Promise<ReleaseAdmissionDecision> {
    const compatibility = await parseCompatibilityReportV2(input.compatibility);
    const verification = input.verification ? parseVerificationReport(input.verification) : undefined;
    const migrations = input.migrations.map((report) => parseMigrationReport(report));
    assertReportIdentities(compatibility, verification, migrations);
    assertUniqueMigrationReports(migrations);

    const reasons: string[] = [];
    if (!compatibility.contractAdmissible) {
        reasons.push("contract-inadmissible");
    }
    if (!verification) {
        reasons.push("verification-missing");
    } else if (verification.outcome !== "passed") {
        reasons.push(
            verification.outcome === "infrastructure-failure"
                ? "verification-infrastructure-failure"
                : "verification-failed",
        );
    }
    for (const requirement of input.requiredMigrations) {
        const report = findRequiredMigration(migrations, requirement);
        const key = migrationRequirementKey(requirement);
        if (!report) {
            reasons.push(`migration-missing:${key}`);
        } else if (report.outcome !== "passed") {
            reasons.push(
                `${report.outcome === "infrastructure-failure" ? "migration-infrastructure-failure" : "migration-failed"}:${key}`,
            );
        }
    }

    return parseReleaseAdmissionDecision({
        schema: "cms.integration.release-admission-decision.v1",
        decisionId: input.decisionId,
        revisionType: input.revisionType,
        ...(input.supersedes ? { supersedes: input.supersedes } : {}),
        kind: compatibility.kind,
        version: compatibility.version,
        packageDigest: compatibility.packageDigest,
        compatibilityReportRevisionId: compatibility.reportId,
        ...(verification ? { verificationReportRevisionId: verification.reportId } : {}),
        migrationReportRevisionIds: migrations.map((report) => report.reportId).toSorted(compareText),
        policy: input.policy,
        admissible: reasons.length === 0,
        reasons: reasons.toSorted(compareText),
        createdAt: input.createdAt,
        provenance: input.provenance,
    });
}

function assertReportIdentities(
    compatibility: Awaited<ReturnType<typeof parseCompatibilityReportV2>>,
    verification: ReturnType<typeof parseVerificationReport> | undefined,
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

function assertUniqueMigrationReports(migrations: readonly MigrationReport[]): void {
    const keys = new Set<string>();
    for (const report of migrations) {
        const key = `${report.source.kind}\0${report.source.version}\0${report.source.packageDigest}\0${report.connectorKey}\0${report.lineageId}`;
        if (keys.has(key)) {
            invalid("migration reports contain duplicate source and connector evidence");
        }
        keys.add(key);
    }
}

function findRequiredMigration(
    reports: readonly MigrationReport[],
    requirement: RequiredMigrationEvidence,
): MigrationReport | undefined {
    return reports.find(
        (report) =>
            sameVersionReference(report.source, requirement.source) &&
            report.connectorKey === requirement.connectorKey &&
            report.lineageId === requirement.lineageId,
    );
}

function migrationRequirementKey(requirement: RequiredMigrationEvidence): string {
    return `${requirement.source.kind}@${requirement.source.version}:${requirement.connectorKey}:${requirement.lineageId}`;
}

function sameVersionReference(
    left: RequiredMigrationEvidence["source"],
    right: RequiredMigrationEvidence["source"],
): boolean {
    return left.kind === right.kind && left.version === right.version && left.packageDigest === right.packageDigest;
}

function invalid(message: string): never {
    throw new IntegrationVerificationContractError("invalid_reference", message, "releaseAdmissionDecision");
}

function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}
