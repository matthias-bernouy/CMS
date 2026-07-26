import type { ReleaseAdmissionDecision } from "../../../interfaces/reports/decision";
import { RELEASE_ADMISSION_DECISION_SCHEMA } from "../../../interfaces/reports/decision";
import { parseVerificationPolicyIdentity } from "../../runner";
import type { IntegrationVerificationContractErrorCode } from "../../validation/errors";
import { IntegrationVerificationContractError } from "../../validation/errors";
import { assertContractIJson, assertUnique, boundedArray, strictRecord } from "../../validation/structure";
import {
    exactVersion,
    oneOf,
    packageKind,
    requiredBoolean,
    requiredText,
    sha256Digest,
    stableIdentifier,
    timestamp,
} from "../../validation/values";
import { identifyCanonicalVerificationContract } from "../../verification/shared";
import { parseReportProvenance } from "../shared";
import {
    assertSelectionReferences,
    compareMigrationReportReference,
    compareText,
    migrationRequirementKey,
    parseMigrationReportReference,
    parseReportReference,
} from "./references";
import { identifyStatefulChangeSelection, parseStatefulChangeSelection } from "./selection";

const FIELDS = [
    "schema",
    "decisionId",
    "revisionType",
    "kind",
    "version",
    "packageDigest",
    "compatibilityReport",
    "verificationReport",
    "migrationReports",
    "policy",
    "policySnapshotDigest",
    "statefulChanges",
    "statefulChangeSelectionDigest",
    "admissible",
    "reasons",
    "createdAt",
    "supersedes",
    "provenance",
] as const;

export function parseReleaseAdmissionDecision(value: unknown): ReleaseAdmissionDecision {
    assertContractIJson(value);
    const input = strictRecord(value, "admissionDecision", FIELDS);
    if (input.schema !== RELEASE_ADMISSION_DECISION_SCHEMA) {
        throw invalid("schema", `must be ${RELEASE_ADMISSION_DECISION_SCHEMA}`, "invalid_schema");
    }
    const decisionId = stableIdentifier(input.decisionId, "admissionDecision.decisionId");
    const revisionType = oneOf(input.revisionType, "admissionDecision.revisionType", ["root", "revision"] as const);
    const supersedes =
        input.supersedes === undefined ? undefined : stableIdentifier(input.supersedes, "admissionDecision.supersedes");
    assertRevisionShape(decisionId, revisionType, supersedes);
    const compatibilityReport = parseReportReference(
        input.compatibilityReport,
        "admissionDecision.compatibilityReport",
    );
    const verificationReport =
        input.verificationReport === undefined
            ? undefined
            : parseReportReference(input.verificationReport, "admissionDecision.verificationReport");
    const migrationReports = boundedArray(
        input.migrationReports,
        "admissionDecision.migrationReports",
        parseMigrationReportReference,
    ).toSorted(compareMigrationReportReference);
    assertUnique(migrationReports.map(migrationRequirementKey), "admissionDecision.migrationReports");
    const statefulChanges = parseStatefulChangeSelection(input.statefulChanges);
    const policySnapshotDigest = sha256Digest(input.policySnapshotDigest, "admissionDecision.policySnapshotDigest");
    const policy = parseVerificationPolicyIdentity(input.policy, "admissionDecision.policy");
    const kind = packageKind(input.kind, "admissionDecision.kind");
    const version = exactVersion(input.version, "admissionDecision.version");
    const packageDigest = sha256Digest(input.packageDigest, "admissionDecision.packageDigest");
    assertSelectionReferences({
        statefulChanges,
        kind,
        version,
        packageDigest,
        policySnapshotDigest,
        policy,
        compatibilityReport,
        migrationReports,
    });
    const admissible = requiredBoolean(input.admissible, "admissionDecision.admissible");
    const reasons = boundedArray(input.reasons, "admissionDecision.reasons", (entry, field) =>
        requiredText(entry, field, 512),
    ).toSorted(compareText);
    assertUnique(reasons, "admissionDecision.reasons");
    if (!admissible && reasons.length === 0) {
        throw invalid("reasons", "must explain an inadmissible decision");
    }
    if (admissible && reasons.length > 0) {
        throw invalid("reasons", "must be empty for an admissible decision");
    }
    return {
        schema: RELEASE_ADMISSION_DECISION_SCHEMA,
        decisionId,
        revisionType,
        kind,
        version,
        packageDigest,
        compatibilityReport,
        ...(verificationReport ? { verificationReport } : {}),
        migrationReports,
        policy,
        policySnapshotDigest,
        statefulChanges,
        statefulChangeSelectionDigest: sha256Digest(
            input.statefulChangeSelectionDigest,
            "admissionDecision.statefulChangeSelectionDigest",
        ),
        admissible,
        reasons,
        createdAt: timestamp(input.createdAt, "admissionDecision.createdAt"),
        ...(supersedes ? { supersedes } : {}),
        provenance: parseReportProvenance(input.provenance, "admissionDecision.provenance"),
    };
}

export async function identifyReleaseAdmissionDecision(value: unknown) {
    const decision = parseReleaseAdmissionDecision(value);
    if (
        (await identifyStatefulChangeSelection(decision.statefulChanges)).digest !==
        decision.statefulChangeSelectionDigest
    ) {
        throw invalid(
            "statefulChangeSelectionDigest",
            "does not identify the embedded trusted stateful-change selection",
            "invalid_digest",
        );
    }
    const identified = await identifyCanonicalVerificationContract(decision);
    return { decision, canonicalBytes: identified.canonicalBytes, digest: identified.digest };
}

function assertRevisionShape(
    decisionId: string,
    revisionType: ReleaseAdmissionDecision["revisionType"],
    supersedes?: string,
): void {
    if (revisionType === "root" && supersedes !== undefined) {
        throw invalid("supersedes", "must be absent on a root decision");
    }
    if (revisionType === "revision" && supersedes === undefined) {
        throw invalid("supersedes", "is required on a revision");
    }
    if (supersedes === decisionId) {
        throw invalid("supersedes", "cannot reference the decision itself");
    }
}

function invalid(field: string, message: string, code: IntegrationVerificationContractErrorCode = "invalid_contract") {
    return new IntegrationVerificationContractError(
        code,
        `admissionDecision.${field} ${message}`,
        `admissionDecision.${field}`,
    );
}
