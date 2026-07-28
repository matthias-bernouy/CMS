import type {
    MigrationReportRevisionDigestReference,
    RequiredMigrationEvidence,
    StatefulChangeSelectionV1,
} from "../../../interfaces/reports/decision";
import type { ReportRevisionDigestReference } from "../../../interfaces/reports/common";
import type { VerificationPolicyIdentity } from "../../../interfaces/runner";
import { IntegrationVerificationContractError } from "../../validation/errors";
import { strictRecord } from "../../validation/structure";
import { positiveInteger, sha256Digest, stableIdentifier } from "../../validation/values";
import { parseVersionDigestReference } from "../shared";

export function parseReportReference(value: unknown, field: string): ReportRevisionDigestReference {
    const input = strictRecord(value, field, ["revisionId", "reportDigest"]);
    return {
        revisionId: stableIdentifier(input.revisionId, `${field}.revisionId`),
        reportDigest: sha256Digest(input.reportDigest, `${field}.reportDigest`),
    };
}

export function parseMigrationReportReference(value: unknown, field: string): MigrationReportRevisionDigestReference {
    const input = strictRecord(value, field, [
        "revisionId",
        "reportDigest",
        "source",
        "connectorKey",
        "lineageId",
        "migrationRevision",
    ]);
    return {
        ...parseReportReference({ revisionId: input.revisionId, reportDigest: input.reportDigest }, field),
        source: parseVersionDigestReference(input.source, `${field}.source`),
        connectorKey: stableIdentifier(input.connectorKey, `${field}.connectorKey`),
        lineageId: stableIdentifier(input.lineageId, `${field}.lineageId`),
        migrationRevision: positiveInteger(input.migrationRevision, `${field}.migrationRevision`),
    };
}

export function parseRequiredMigration(value: unknown, field: string): RequiredMigrationEvidence {
    const input = strictRecord(value, field, ["source", "connectorKey", "lineageId"]);
    return {
        source: parseVersionDigestReference(input.source, `${field}.source`),
        connectorKey: stableIdentifier(input.connectorKey, `${field}.connectorKey`),
        lineageId: stableIdentifier(input.lineageId, `${field}.lineageId`),
    };
}

export function assertSelectionReferences(input: {
    statefulChanges: StatefulChangeSelectionV1;
    kind: string;
    version: string;
    packageDigest: string;
    policySnapshotDigest: string;
    policy: VerificationPolicyIdentity;
    compatibilityReport: ReportRevisionDigestReference;
    migrationReports: readonly MigrationReportRevisionDigestReference[];
}): void {
    const { target } = input.statefulChanges;
    if (
        target.kind !== input.kind ||
        target.version !== input.version ||
        target.packageDigest !== input.packageDigest ||
        input.statefulChanges.policySnapshotDigest !== input.policySnapshotDigest ||
        input.statefulChanges.selector.name !== input.policy.name ||
        input.statefulChanges.selector.version !== input.policy.version ||
        !sameReportReference(input.statefulChanges.compatibilityReport, input.compatibilityReport)
    ) {
        throw invalid("statefulChanges must bind this release, policy snapshot, and compatibility revision exactly");
    }
    const unknownMigration = input.migrationReports.find(
        (reference) =>
            !input.statefulChanges.requiredMigrations.some(
                (requirement) => migrationRequirementKey(requirement) === migrationRequirementKey(reference),
            ),
    );
    if (unknownMigration) {
        throw invalid("migrationReports cannot cite evidence outside the trusted stateful-change selection");
    }
}

export function migrationRequirementKey(input: RequiredMigrationEvidence): string {
    return `${input.source.kind}\0${input.source.version}\0${input.source.packageDigest}\0${input.connectorKey}\0${input.lineageId}`;
}

export function compareRequiredMigration(left: RequiredMigrationEvidence, right: RequiredMigrationEvidence): number {
    return compareText(migrationRequirementKey(left), migrationRequirementKey(right));
}

export function compareMigrationReportReference(
    left: MigrationReportRevisionDigestReference,
    right: MigrationReportRevisionDigestReference,
): number {
    return compareText(migrationRequirementKey(left), migrationRequirementKey(right));
}

export function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}

function sameReportReference(left: ReportRevisionDigestReference, right: ReportRevisionDigestReference): boolean {
    return left.revisionId === right.revisionId && left.reportDigest === right.reportDigest;
}

function invalid(message: string): IntegrationVerificationContractError {
    return new IntegrationVerificationContractError(
        "invalid_reference",
        `admissionDecision.${message}`,
        "admissionDecision",
    );
}
