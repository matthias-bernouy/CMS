import type {
    DigestContractReference,
    ReportHistoryFields,
    ReportProvenance,
    VersionDigestReference,
} from "../../interfaces/reports/common";
import type { AdmissionReviewedBaselineReferenceV1 } from "../../interfaces/verification";
import { IntegrationVerificationContractError } from "../validation/errors";
import { assertUnique, boundedArray, strictRecord } from "../validation/structure";
import {
    exactVersion,
    oneOf,
    packageKind,
    requiredText,
    sha256Digest,
    stableIdentifier,
    timestamp,
} from "../validation/values";

export function parseReportHistoryFields(input: Record<string, unknown>, field = "report"): ReportHistoryFields {
    const reportId = stableIdentifier(input.reportId, `${field}.reportId`);
    const revisionType = oneOf(input.revisionType, `${field}.revisionType`, ["root", "revision"] as const);
    const origin = oneOf(input.origin, `${field}.origin`, ["admission", "legacy-backfill"] as const);
    const supersedes =
        input.supersedes === undefined ? undefined : stableIdentifier(input.supersedes, `${field}.supersedes`);
    if (revisionType === "root" && supersedes !== undefined) {
        throw invalidHistory(field, "a root report cannot supersede another report");
    }
    if (revisionType === "revision" && supersedes === undefined) {
        throw invalidHistory(field, "a report revision must identify the report it supersedes");
    }
    if (supersedes === reportId) {
        throw invalidHistory(field, "a report cannot supersede itself");
    }
    return {
        reportId,
        revisionType,
        origin,
        createdAt: timestamp(input.createdAt, `${field}.createdAt`),
        ...(supersedes ? { supersedes } : {}),
    };
}

export function parseReportProvenance(value: unknown, field: string): ReportProvenance {
    const input = strictRecord(value, field, ["actor", "reason", "evidenceIds"]);
    const evidenceIds =
        input.evidenceIds === undefined
            ? undefined
            : boundedArray(input.evidenceIds, `${field}.evidenceIds`, (entry, entryField) =>
                  stableIdentifier(entry, entryField),
              );
    if (evidenceIds) {
        assertUnique(evidenceIds, `${field}.evidenceIds`);
    }
    return {
        actor: stableIdentifier(input.actor, `${field}.actor`),
        reason: requiredText(input.reason, `${field}.reason`),
        ...(evidenceIds && evidenceIds.length > 0 ? { evidenceIds } : {}),
    };
}

export function parseVersionDigestReference(value: unknown, field: string): VersionDigestReference {
    const input = strictRecord(value, field, ["kind", "version", "packageDigest"]);
    return {
        kind: packageKind(input.kind, `${field}.kind`),
        version: exactVersion(input.version, `${field}.version`),
        packageDigest: sha256Digest(input.packageDigest, `${field}.packageDigest`),
    };
}

export function parseVersionDigestReferences(value: unknown, field: string): VersionDigestReference[] {
    const references = boundedArray(value, field, parseVersionDigestReference);
    assertUnique(
        references.map((entry) => `${entry.kind}@${entry.version}:${entry.packageDigest}`),
        field,
    );
    return references;
}

export function parseReviewedBaselineReferences(value: unknown, field: string): AdmissionReviewedBaselineReferenceV1[] {
    const references = boundedArray(value, field, parseReviewedBaselineReference);
    assertUnique(
        references.map(
            (entry) =>
                `${entry.kind}\0${entry.version}\0${entry.packageDigest}\0${entry.connectorKey}\0${entry.lineageId}`,
        ),
        field,
    );
    return references;
}

function parseReviewedBaselineReference(value: unknown, field: string): AdmissionReviewedBaselineReferenceV1 {
    const input = strictRecord(value, field, [
        "kind",
        "version",
        "packageDigest",
        "connectorKey",
        "lineageId",
        "revisionId",
        "baselineDigest",
        "observedSchemaDigest",
    ]);
    return {
        ...parseVersionDigestReference(
            { kind: input.kind, version: input.version, packageDigest: input.packageDigest },
            field,
        ),
        connectorKey: stableIdentifier(input.connectorKey, `${field}.connectorKey`),
        lineageId: stableIdentifier(input.lineageId, `${field}.lineageId`),
        revisionId: stableIdentifier(input.revisionId, `${field}.revisionId`),
        baselineDigest: sha256Digest(input.baselineDigest, `${field}.baselineDigest`),
        observedSchemaDigest: sha256Digest(input.observedSchemaDigest, `${field}.observedSchemaDigest`),
    };
}

export function parseDigestContractReference(value: unknown, field: string): DigestContractReference {
    const input = strictRecord(value, field, ["contractId", "ownerVersion", "digest"]);
    return {
        contractId: stableIdentifier(input.contractId, `${field}.contractId`),
        ownerVersion: exactVersion(input.ownerVersion, `${field}.ownerVersion`),
        digest: sha256Digest(input.digest, `${field}.digest`),
    };
}

export function assertReportRevisionFollows(previous: ReportHistoryFields, next: ReportHistoryFields): void {
    if (next.revisionType !== "revision" || next.supersedes !== previous.reportId) {
        throw invalidHistory("report", "revision must supersede the current report exactly");
    }
    if (next.origin !== previous.origin) {
        throw invalidHistory("report.origin", "must remain stable across a report history");
    }
    if (Date.parse(next.createdAt) < Date.parse(previous.createdAt)) {
        throw invalidHistory("report.createdAt", "must not precede the current report");
    }
}

function invalidHistory(field: string, message: string): IntegrationVerificationContractError {
    return new IntegrationVerificationContractError("invalid_contract", `${field} ${message}`, field);
}
