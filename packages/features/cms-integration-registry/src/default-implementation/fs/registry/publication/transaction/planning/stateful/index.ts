import {
    identifyStatefulChangeSelection,
    type CompatibilityReportV2,
    type IdentifiedStatefulChangeSelectionV1,
    type ReleaseAdmissionPolicySnapshotV1,
} from "@bernouy/cms-integration-verification";
import type { IntegrationRegistryCatalogSnapshot } from "cms-integration-registry/interfaces/catalog";
import type { CapturedReviewedSchemaBaselineStore } from "../baselines";
import { FsIntegrationRegistryCandidateAdmissionPlanningError } from "../types";

export { buildMigrationVerificationInputs } from "./inputs";

export async function selectStatefulChanges(input: {
    snapshot: IntegrationRegistryCatalogSnapshot;
    report: CompatibilityReportV2;
    reportDigest: string;
    policy: ReleaseAdmissionPolicySnapshotV1;
    policyDigest: string;
    baselines: CapturedReviewedSchemaBaselineStore;
}): Promise<IdentifiedStatefulChangeSelectionV1> {
    const requiredMigrations = migrationEvidenceRequired(input) ? requiredMigrationEvidence(input) : [];
    return await identifyStatefulChangeSelection({
        schema: "cms.integration.stateful-change-selection.v1",
        selector: input.policy.migrationPolicy,
        policySnapshotDigest: input.policyDigest,
        target: {
            kind: input.report.kind,
            version: input.report.version,
            packageDigest: input.report.packageDigest,
        },
        compatibilityReport: { revisionId: input.report.reportId, reportDigest: input.reportDigest },
        requiredMigrations,
    });
}

function migrationEvidenceRequired(input: {
    report: CompatibilityReportV2;
    policy: ReleaseAdmissionPolicySnapshotV1;
}): boolean {
    return (
        input.report.releaseLevel !== "initial" &&
        input.policy.migrationEvidence.requiredForReleaseLevels.includes(input.report.releaseLevel) &&
        input.report.findings.some((finding) => finding.surface === "schema")
    );
}

function requiredMigrationEvidence(input: {
    snapshot: IntegrationRegistryCatalogSnapshot;
    report: CompatibilityReportV2;
    baselines: CapturedReviewedSchemaBaselineStore;
}) {
    const sources = [...input.report.baselines, ...input.report.informationalBaselines];
    const result = [];
    for (const source of sources) {
        const location = input.snapshot.locateExactVersion(source.kind, source.version);
        if (!location || location.package.digest !== source.packageDigest) {
            throw new FsIntegrationRegistryCandidateAdmissionPlanningError(
                "catalog_changed",
                `Stateful source ${source.kind}@${source.version} changed during planning`,
            );
        }
        const sqlConnectors = (location.definitionSnapshot.connectors ?? []).filter(
            (connector) => (connector.schemas?.length ?? 0) > 0,
        );
        if (sqlConnectors.length === 0) {
            continue;
        }
        const histories = input.baselines
            .histories()
            .filter(
                (history) =>
                    history.logicalKey.kind === source.kind &&
                    history.logicalKey.version === source.version &&
                    history.logicalKey.packageDigest === source.packageDigest,
            );
        if (histories.length === 0) {
            throw new FsIntegrationRegistryCandidateAdmissionPlanningError(
                "missing_migration_baseline",
                `Stateful source ${source.kind}@${source.version} has no reviewed connector baseline`,
            );
        }
        for (const history of histories) {
            result.push({
                source,
                connectorKey: history.logicalKey.connectorKey,
                lineageId: history.logicalKey.lineageId,
            });
        }
    }
    return result;
}
