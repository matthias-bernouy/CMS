import type {
    ComposeReleaseAdmissionDecisionInput,
    IdentifiedStatefulChangeSelectionV1,
    ReleaseAdmissionDecision,
} from "../../../../interfaces/reports/decision";
import { MIGRATION_REPORT_V2_SCHEMA } from "../../../../interfaces/reports/migration";
import { identifyCompatibilityReportV2 } from "../../compatibility";
import { identifyMigrationReport } from "../../migration";
import { identifyVerificationReport } from "../../verification";
import { identifyReleaseAdmissionDecision, parseReleaseAdmissionDecision } from "../parser";
import { identifyStatefulChangeSelection } from "../selection";
import {
    assertPolicyBindings,
    assertReportIdentities,
    assertStatefulChangeBindings,
    assertUniqueMigrationReports,
    compareText,
    findRequiredMigration,
    invalid,
    migrationRequirementKey,
} from "./assertions";

export async function composeReleaseAdmissionDecision(
    input: ComposeReleaseAdmissionDecisionInput,
): Promise<ReleaseAdmissionDecision> {
    const compatibility = await identifyCompatibilityReportV2(input.compatibility);
    const verification = input.verification ? await identifyVerificationReport(input.verification) : undefined;
    const migrations = await Promise.all(input.migrations.map(async (report) => await identifyMigrationReport(report)));
    const statefulChanges = await validateStatefulChangeSelection(input.statefulChanges);
    const migrationReports = migrations.map(({ report }) => report);
    assertReportIdentities(compatibility.report, verification?.report, migrationReports);
    assertPolicyBindings(
        input.policy,
        input.policySnapshotDigest,
        statefulChanges.digest,
        verification?.report,
        migrationReports,
    );
    assertStatefulChangeBindings(statefulChanges, input.policySnapshotDigest, compatibility);
    assertUniqueMigrationReports(migrationReports);

    const reasons: string[] = [];
    if (!compatibility.report.contractAdmissible) {
        reasons.push("contract-inadmissible");
    }
    if (!verification) {
        reasons.push("verification-missing");
    } else if (verification.report.outcome !== "passed") {
        reasons.push(
            verification.report.outcome === "infrastructure-failure"
                ? "verification-infrastructure-failure"
                : "verification-failed",
        );
    }
    const selectedMigrations: typeof migrations = [];
    for (const requirement of statefulChanges.selection.requiredMigrations) {
        const report = findRequiredMigration(migrations, requirement);
        const key = migrationRequirementKey(requirement);
        if (!report) {
            reasons.push(`migration-missing:${key}`);
        } else {
            selectedMigrations.push(report);
            if (report.report.schema === MIGRATION_REPORT_V2_SCHEMA) {
                if (report.report.policyEvaluation.releaseLevel !== compatibility.report.releaseLevel) {
                    invalid(`migration report ${report.report.reportId} evaluated a different release level`);
                }
                if (!report.report.policyEvaluation.applicable) {
                    reasons.push(`migration-policy-not-applicable:${key}`);
                } else {
                    reasons.push(
                        ...report.report.policyEvaluation.reasons.map(
                            (reason) => `migration-policy-failed:${key}:${reason}`,
                        ),
                    );
                }
            } else if (report.report.outcome !== "passed") {
                const reason =
                    report.report.outcome === "infrastructure-failure"
                        ? "migration-infrastructure-failure"
                        : "migration-failed";
                reasons.push(`${reason}:${key}`);
            }
        }
    }
    if (selectedMigrations.length !== migrations.length) {
        invalid("migration reports include evidence not selected by the trusted stateful-change input");
    }

    return parseReleaseAdmissionDecision({
        schema: "cms.integration.release-admission-decision.v1",
        decisionId: input.decisionId,
        revisionType: input.revisionType,
        ...(input.supersedes ? { supersedes: input.supersedes } : {}),
        kind: compatibility.report.kind,
        version: compatibility.report.version,
        packageDigest: compatibility.report.packageDigest,
        compatibilityReport: { revisionId: compatibility.report.reportId, reportDigest: compatibility.digest },
        ...(verification
            ? { verificationReport: { revisionId: verification.report.reportId, reportDigest: verification.digest } }
            : {}),
        migrationReports: selectedMigrations
            .map(({ report, digest }) => ({
                revisionId: report.reportId,
                reportDigest: digest,
                source: report.source,
                connectorKey: report.connectorKey,
                lineageId: report.lineageId,
                migrationRevision: report.migrationRevision,
            }))
            .toSorted((left, right) => compareText(migrationRequirementKey(left), migrationRequirementKey(right))),
        policy: input.policy,
        policySnapshotDigest: input.policySnapshotDigest,
        statefulChanges: statefulChanges.selection,
        statefulChangeSelectionDigest: statefulChanges.digest,
        admissible: reasons.length === 0,
        reasons: reasons.toSorted(compareText),
        createdAt: input.createdAt,
        provenance: input.provenance,
    });
}

export async function assertReleaseAdmissionDecisionMatchesReports(
    value: unknown,
    reports: Readonly<{
        compatibility: ComposeReleaseAdmissionDecisionInput["compatibility"];
        verification?: ComposeReleaseAdmissionDecisionInput["verification"];
        migrations: ComposeReleaseAdmissionDecisionInput["migrations"];
    }>,
): Promise<ReleaseAdmissionDecision> {
    const identified = await identifyReleaseAdmissionDecision(value);
    const recomposed = await composeReleaseAdmissionDecision({
        decisionId: identified.decision.decisionId,
        revisionType: identified.decision.revisionType,
        ...(identified.decision.supersedes ? { supersedes: identified.decision.supersedes } : {}),
        compatibility: reports.compatibility,
        ...(reports.verification ? { verification: reports.verification } : {}),
        migrations: reports.migrations,
        statefulChanges: await identifyStatefulChangeSelection(identified.decision.statefulChanges),
        policy: identified.decision.policy,
        policySnapshotDigest: identified.decision.policySnapshotDigest,
        createdAt: identified.decision.createdAt,
        provenance: identified.decision.provenance,
    });
    if ((await identifyReleaseAdmissionDecision(recomposed)).digest !== identified.digest) {
        invalid("decision is stale or does not match the exact report revisions it cites");
    }
    return identified.decision;
}

async function validateStatefulChangeSelection(
    identified: IdentifiedStatefulChangeSelectionV1,
): Promise<IdentifiedStatefulChangeSelectionV1> {
    const reparsed = await identifyStatefulChangeSelection(identified.selection);
    if (reparsed.digest !== identified.digest) {
        invalid("trusted stateful-change selection digest does not identify its canonical content");
    }
    return reparsed;
}
