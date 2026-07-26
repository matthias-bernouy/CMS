import type { ReleaseAdmissionDecision } from "../../interfaces/reports/decision";
import { RELEASE_ADMISSION_DECISION_SCHEMA } from "../../interfaces/reports/decision";
import { parseVerificationPolicyIdentity } from "../runner";
import { IntegrationVerificationContractError } from "../validation/errors";
import { assertContractIJson, assertUnique, boundedArray, strictRecord } from "../validation/structure";
import {
    exactVersion,
    oneOf,
    packageKind,
    requiredBoolean,
    requiredText,
    sha256Digest,
    stableIdentifier,
    timestamp,
} from "../validation/values";
import { parseReportProvenance } from "./shared";

const FIELDS = [
    "schema",
    "decisionId",
    "revisionType",
    "kind",
    "version",
    "packageDigest",
    "compatibilityReportRevisionId",
    "verificationReportRevisionId",
    "migrationReportRevisionIds",
    "policy",
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
        throw new IntegrationVerificationContractError(
            "invalid_schema",
            `admissionDecision.schema must be ${RELEASE_ADMISSION_DECISION_SCHEMA}`,
            "admissionDecision.schema",
        );
    }
    const decisionId = stableIdentifier(input.decisionId, "admissionDecision.decisionId");
    const revisionType = oneOf(input.revisionType, "admissionDecision.revisionType", ["root", "revision"] as const);
    const supersedes =
        input.supersedes === undefined ? undefined : stableIdentifier(input.supersedes, "admissionDecision.supersedes");
    assertRevisionShape(decisionId, revisionType, supersedes);
    const migrationReportRevisionIds = boundedArray(
        input.migrationReportRevisionIds,
        "admissionDecision.migrationReportRevisionIds",
        (entry, field) => stableIdentifier(entry, field),
    );
    assertUnique(migrationReportRevisionIds, "admissionDecision.migrationReportRevisionIds");
    const admissible = requiredBoolean(input.admissible, "admissionDecision.admissible");
    const reasons = boundedArray(input.reasons, "admissionDecision.reasons", (entry, field) =>
        requiredText(entry, field),
    );
    if (!admissible && reasons.length === 0) {
        throw invalid("admissionDecision.reasons", "must explain an inadmissible decision");
    }
    return {
        schema: RELEASE_ADMISSION_DECISION_SCHEMA,
        decisionId,
        revisionType,
        kind: packageKind(input.kind, "admissionDecision.kind"),
        version: exactVersion(input.version, "admissionDecision.version"),
        packageDigest: sha256Digest(input.packageDigest, "admissionDecision.packageDigest"),
        compatibilityReportRevisionId: stableIdentifier(
            input.compatibilityReportRevisionId,
            "admissionDecision.compatibilityReportRevisionId",
        ),
        ...(input.verificationReportRevisionId === undefined
            ? {}
            : {
                  verificationReportRevisionId: stableIdentifier(
                      input.verificationReportRevisionId,
                      "admissionDecision.verificationReportRevisionId",
                  ),
              }),
        migrationReportRevisionIds,
        policy: parseVerificationPolicyIdentity(input.policy, "admissionDecision.policy"),
        admissible,
        reasons,
        createdAt: timestamp(input.createdAt, "admissionDecision.createdAt"),
        ...(supersedes ? { supersedes } : {}),
        provenance: parseReportProvenance(input.provenance, "admissionDecision.provenance"),
    };
}

export function appendReleaseAdmissionDecision(
    history: readonly ReleaseAdmissionDecision[],
    next: ReleaseAdmissionDecision,
): readonly ReleaseAdmissionDecision[] {
    assertReleaseAdmissionDecisionHistory(history);
    const previous = history.at(-1);
    if (!previous) {
        if (next.revisionType !== "root") {
            throw invalid("admissionDecision.revisionType", "must be root for the first decision");
        }
        return Object.freeze([next]);
    }
    if (next.revisionType !== "revision" || next.supersedes !== previous.decisionId) {
        throw invalid("admissionDecision.supersedes", "must reference the current decision exactly");
    }
    if (
        next.kind !== previous.kind ||
        next.version !== previous.version ||
        next.packageDigest !== previous.packageDigest
    ) {
        throw invalid("admissionDecision", "cannot change the release identity in one decision history");
    }
    if (Date.parse(next.createdAt) < Date.parse(previous.createdAt)) {
        throw invalid("admissionDecision.createdAt", "must not precede the current decision");
    }
    return Object.freeze([...history, next]);
}

export function assertReleaseAdmissionDecisionHistory(history: readonly ReleaseAdmissionDecision[]): void {
    const root = history[0];
    const decisionIds = new Set<string>();
    for (const [index, decision] of history.entries()) {
        if (decisionIds.has(decision.decisionId)) {
            throw invalid(`admissionDecisionHistory.${index}.decisionId`, "must be unique in its history");
        }
        decisionIds.add(decision.decisionId);
        if (index === 0 && (decision.revisionType !== "root" || decision.supersedes !== undefined)) {
            throw invalid("admissionDecisionHistory.0", "must be a root decision");
        }
        if (
            index > 0 &&
            (decision.revisionType !== "revision" || decision.supersedes !== history[index - 1]?.decisionId)
        ) {
            throw invalid(`admissionDecisionHistory.${index}.supersedes`, "must reference the preceding decision");
        }
        if (
            root &&
            (decision.kind !== root.kind ||
                decision.version !== root.version ||
                decision.packageDigest !== root.packageDigest)
        ) {
            throw invalid(`admissionDecisionHistory.${index}`, "must preserve the root release identity");
        }
        const previous = history[index - 1];
        if (previous && Date.parse(decision.createdAt) < Date.parse(previous.createdAt)) {
            throw invalid(`admissionDecisionHistory.${index}.createdAt`, "must not precede the prior decision");
        }
    }
}

function assertRevisionShape(
    decisionId: string,
    revisionType: ReleaseAdmissionDecision["revisionType"],
    supersedes: string | undefined,
): void {
    if (revisionType === "root" && supersedes !== undefined) {
        throw invalid("admissionDecision.supersedes", "must be absent on a root decision");
    }
    if (revisionType === "revision" && supersedes === undefined) {
        throw invalid("admissionDecision.supersedes", "is required on a revision");
    }
    if (supersedes === decisionId) {
        throw invalid("admissionDecision.supersedes", "cannot reference the decision itself");
    }
}

function invalid(field: string, message: string): IntegrationVerificationContractError {
    return new IntegrationVerificationContractError("invalid_contract", `${field} ${message}`, field);
}
