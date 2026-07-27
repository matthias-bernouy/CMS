import type { MigrationCutoverEvidence, MigrationReportV4 } from "../../../interfaces/reports/migration";
import { IntegrationVerificationContractError } from "../../validation/errors";
import { strictRecord } from "../../validation/structure";
import { parseMigrationCheck } from "./results";

export function parseMigrationCutoverEvidence(value: unknown): MigrationCutoverEvidence {
    const input = strictRecord(value, "migrationReport.cutoverEvidence", [
        "cmsMediated",
        "providerDirect",
        "activation",
    ]);
    return {
        cmsMediated: parseMigrationCheck(input.cmsMediated, "migrationReport.cutoverEvidence.cmsMediated"),
        providerDirect: parseMigrationCheck(input.providerDirect, "migrationReport.cutoverEvidence.providerDirect"),
        activation: parseMigrationCheck(input.activation, "migrationReport.cutoverEvidence.activation"),
    };
}

export function assertMigrationCutoverEvidenceMatchesReport(report: MigrationReportV4): void {
    assertStrategyEvidence(
        "migrationReport.cutoverEvidence.cmsMediated",
        report.cutover.cmsMediated,
        report.cutoverEvidence.cmsMediated.outcome,
    );
    assertStrategyEvidence(
        "migrationReport.cutoverEvidence.providerDirect",
        report.cutover.providerDirect,
        report.cutoverEvidence.providerDirect.outcome,
    );
}

function assertStrategyEvidence(field: string, strategy: string, outcome: string): void {
    const applicable = strategy !== "not-applicable";
    if (applicable === (outcome === "not-applicable")) {
        throw new IntegrationVerificationContractError(
            "invalid_contract",
            `${field} must be not-applicable exactly when its declared strategy is not-applicable`,
            field,
        );
    }
}
