import type {
    AdmissionActiveContractReferenceV1,
    AdmissionDependencyReferenceV1,
    AdmissionInputSnapshotV1,
    AdmissionReviewedBaselineReferenceV1,
    AdmissionSuitePlanEntryV1,
} from "../../../interfaces/verification";
import { strictRecord } from "../../validation/structure";
import { exactVersion, oneOf, packageKind, sha256Digest, stableIdentifier } from "../../validation/values";
import { compareText } from "../shared";

export function parseCandidate(value: unknown): AdmissionInputSnapshotV1["candidate"] {
    const input = strictRecord(value, "admission.candidate", [
        "candidateId",
        "candidateDigest",
        "kind",
        "version",
        "packageDigest",
        "verificationDigest",
    ]);
    return {
        candidateId: stableIdentifier(input.candidateId, "admission.candidate.candidateId"),
        candidateDigest: sha256Digest(input.candidateDigest, "admission.candidate.candidateDigest"),
        kind: packageKind(input.kind, "admission.candidate.kind"),
        version: exactVersion(input.version, "admission.candidate.version"),
        packageDigest: sha256Digest(input.packageDigest, "admission.candidate.packageDigest"),
        verificationDigest: sha256Digest(input.verificationDigest, "admission.candidate.verificationDigest"),
    };
}

export function parseReviewedBaseline(value: unknown, field: string): AdmissionReviewedBaselineReferenceV1 {
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
        kind: packageKind(input.kind, `${field}.kind`),
        version: exactVersion(input.version, `${field}.version`),
        packageDigest: sha256Digest(input.packageDigest, `${field}.packageDigest`),
        connectorKey: stableIdentifier(input.connectorKey, `${field}.connectorKey`),
        lineageId: stableIdentifier(input.lineageId, `${field}.lineageId`),
        revisionId: stableIdentifier(input.revisionId, `${field}.revisionId`),
        baselineDigest: sha256Digest(input.baselineDigest, `${field}.baselineDigest`),
        observedSchemaDigest: sha256Digest(input.observedSchemaDigest, `${field}.observedSchemaDigest`),
    };
}

export function parseDependency(value: unknown, field: string): AdmissionDependencyReferenceV1 {
    const input = strictRecord(value, field, ["kind", "version", "packageDigest"]);
    return {
        kind: packageKind(input.kind, `${field}.kind`),
        version: exactVersion(input.version, `${field}.version`),
        packageDigest: sha256Digest(input.packageDigest, `${field}.packageDigest`),
    };
}

export function parseActiveContract(value: unknown, field: string): AdmissionActiveContractReferenceV1 {
    const input = strictRecord(value, field, ["contractId", "lineageId", "ownerVersion", "contractDigest"]);
    return {
        contractId: stableIdentifier(input.contractId, `${field}.contractId`),
        lineageId: stableIdentifier(input.lineageId, `${field}.lineageId`),
        ownerVersion: exactVersion(input.ownerVersion, `${field}.ownerVersion`),
        contractDigest: sha256Digest(input.contractDigest, `${field}.contractDigest`),
    };
}

export function parseSuite(value: unknown, field: string): AdmissionSuitePlanEntryV1 {
    const input = strictRecord(value, field, ["suiteId", "source", "contentDigest"]);
    return {
        suiteId: stableIdentifier(input.suiteId, `${field}.suiteId`),
        source: oneOf(input.source, `${field}.source`, ["platform", "author-contract", "author-conformance"] as const),
        contentDigest: sha256Digest(input.contentDigest, `${field}.contentDigest`),
    };
}

export function parseRevision(value: unknown, field: string): AdmissionInputSnapshotV1["catalogRevision"] {
    const input = strictRecord(value, field, ["revisionId", "digest"]);
    return {
        revisionId: stableIdentifier(input.revisionId, `${field}.revisionId`),
        digest: sha256Digest(input.digest, `${field}.digest`),
    };
}

export function parseCompatibilityRevision(value: unknown): AdmissionInputSnapshotV1["compatibilityRevision"] {
    const field = "admission.compatibilityRevision";
    const input = strictRecord(value, field, ["revisionId", "digest", "evaluatorInputDigest"]);
    return {
        revisionId: stableIdentifier(input.revisionId, `${field}.revisionId`),
        digest: sha256Digest(input.digest, `${field}.digest`),
        evaluatorInputDigest: sha256Digest(input.evaluatorInputDigest, `${field}.evaluatorInputDigest`),
    };
}

export function compareBaseline(
    left: AdmissionReviewedBaselineReferenceV1,
    right: AdmissionReviewedBaselineReferenceV1,
): number {
    return compareText(
        `${left.kind}\0${left.version}\0${left.packageDigest}\0${left.connectorKey}\0${left.lineageId}`,
        `${right.kind}\0${right.version}\0${right.packageDigest}\0${right.connectorKey}\0${right.lineageId}`,
    );
}

export function compareDependency(left: AdmissionDependencyReferenceV1, right: AdmissionDependencyReferenceV1): number {
    return compareText(
        `${left.kind}\0${left.version}\0${left.packageDigest}`,
        `${right.kind}\0${right.version}\0${right.packageDigest}`,
    );
}
