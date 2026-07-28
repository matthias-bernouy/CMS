import type {
    PlatformVerificationCheckEvidenceV1,
    PlatformVerificationEvidenceV1,
    PlatformVerificationFindingV1,
} from "../../../interfaces/verification";
import { PLATFORM_VERIFICATION_EVIDENCE_SCHEMA } from "../../../interfaces/verification";
import { IntegrationVerificationContractError } from "../../validation/errors";
import { assertUnique, boundedArray, strictRecord } from "../../validation/structure";
import {
    nonNegativeInteger,
    oneOf,
    requiredBoolean,
    requiredText,
    sha256Digest,
    stableIdentifier,
} from "../../validation/values";
import { compareText } from "../shared";

const MAX_CHECKS = 32;
const MAX_FINDINGS_PER_CHECK = 256;

export function parsePlatformVerificationEvidence(value: unknown): PlatformVerificationEvidenceV1 {
    const input = strictRecord(value, "platformEvidence", [
        "schema",
        "suiteId",
        "suiteDigest",
        "applicability",
        "outcome",
        "checks",
    ]);
    if (input.schema !== PLATFORM_VERIFICATION_EVIDENCE_SCHEMA) {
        throw invalid("platformEvidence.schema", `must be ${PLATFORM_VERIFICATION_EVIDENCE_SCHEMA}`);
    }
    const checks = boundedArray(input.checks, "platformEvidence.checks", parseCheck, {
        minimum: 1,
        maximum: MAX_CHECKS,
    }).toSorted((left, right) => compareText(left.checkId, right.checkId));
    assertUnique(
        checks.map((entry) => entry.checkId),
        "platformEvidence.checks.checkId",
    );
    const outcome = oneOf(input.outcome, "platformEvidence.outcome", ["passed", "failed", "not-applicable"] as const);
    const expected = checks.every((entry) => entry.outcome === "not-applicable")
        ? "not-applicable"
        : checks.some((entry) => entry.outcome === "failed")
          ? "failed"
          : "passed";
    if (outcome !== expected) {
        throw invalid("platformEvidence.outcome", `must be ${expected} for its check outcomes`);
    }
    return {
        schema: PLATFORM_VERIFICATION_EVIDENCE_SCHEMA,
        suiteId: stableIdentifier(input.suiteId, "platformEvidence.suiteId"),
        suiteDigest: sha256Digest(input.suiteDigest, "platformEvidence.suiteDigest"),
        applicability: oneOf(input.applicability, "platformEvidence.applicability", [
            "always",
            "sql-connectors",
            "data-api-schemas",
        ] as const),
        outcome,
        checks,
    };
}

function parseCheck(value: unknown, field: string): PlatformVerificationCheckEvidenceV1 {
    const input = strictRecord(value, field, [
        "checkId",
        "outcome",
        "subjectCount",
        "observationDigest",
        "findings",
        "findingsTruncated",
    ]);
    const findings = boundedArray(input.findings, `${field}.findings`, parseFinding, {
        maximum: MAX_FINDINGS_PER_CHECK,
    }).toSorted((left, right) => compareText(`${left.code}\0${left.path}`, `${right.code}\0${right.path}`));
    assertUnique(
        findings.map((entry) => `${entry.code}\0${entry.path}`),
        `${field}.findings`,
    );
    const outcome = oneOf(input.outcome, `${field}.outcome`, ["passed", "failed", "not-applicable"] as const);
    if ((outcome === "failed") !== findings.length > 0) {
        throw invalid(`${field}.findings`, "must be non-empty exactly for a failed check");
    }
    return {
        checkId: stableIdentifier(input.checkId, `${field}.checkId`),
        outcome,
        subjectCount: nonNegativeInteger(input.subjectCount, `${field}.subjectCount`),
        observationDigest: sha256Digest(input.observationDigest, `${field}.observationDigest`),
        findings,
        findingsTruncated: requiredBoolean(input.findingsTruncated, `${field}.findingsTruncated`),
    };
}

function parseFinding(value: unknown, field: string): PlatformVerificationFindingV1 {
    const input = strictRecord(value, field, ["code", "path"]);
    return {
        code: stableIdentifier(input.code, `${field}.code`),
        path: requiredText(input.path, `${field}.path`, 4_096),
    };
}

function invalid(field: string, message: string): IntegrationVerificationContractError {
    return new IntegrationVerificationContractError("invalid_contract", `${field} ${message}`, field);
}
