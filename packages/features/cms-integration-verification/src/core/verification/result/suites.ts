import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import type { VerificationJobSuiteResultV1 } from "../../../interfaces/verification";
import { parsePlatformVerificationEvidence } from "../platform";
import { IntegrationVerificationContractError } from "../../validation/errors";
import { assertUnique, boundedArray, strictRecord } from "../../validation/structure";
import {
    nonNegativeInteger,
    oneOf,
    positiveInteger,
    requiredBoolean,
    requiredText,
    sha256Digest,
    stableIdentifier,
} from "../../validation/values";
import { compareText } from "../shared";

const MAX_DIAGNOSTICS_PER_SUITE = 8;
const MAX_DIAGNOSTIC_BYTES = 16_384;
const MAX_TOTAL_DIAGNOSTIC_BYTES = 65_536;
const MAX_EVIDENCE_DIGESTS_PER_SUITE = 64;
const utf8 = new TextEncoder();

export function parseSuiteResult(value: unknown, field: string): VerificationJobSuiteResultV1 {
    const input = strictRecord(value, field, [
        "suiteId",
        "outcome",
        "durationMs",
        "attempts",
        "cacheHit",
        "evidenceDigests",
        "diagnostics",
        "platformEvidence",
    ]);
    const evidenceDigests = boundedArray(input.evidenceDigests, `${field}.evidenceDigests`, sha256Digest, {
        maximum: MAX_EVIDENCE_DIGESTS_PER_SUITE,
    }).toSorted(compareText);
    assertUnique(evidenceDigests, `${field}.evidenceDigests`);
    const diagnostics = boundedArray(input.diagnostics, `${field}.diagnostics`, parseDiagnostic, {
        maximum: MAX_DIAGNOSTICS_PER_SUITE,
    }).toSorted((left, right) => compareText(`${left.code}\0${left.message}`, `${right.code}\0${right.message}`));
    assertUnique(
        diagnostics.map((entry) => entry.code),
        `${field}.diagnostics.code`,
    );
    return {
        suiteId: stableIdentifier(input.suiteId, `${field}.suiteId`),
        outcome: oneOf(input.outcome, `${field}.outcome`, [
            "passed",
            "failed",
            "skipped",
            "not-applicable",
            "infrastructure-failure",
        ] as const),
        durationMs: nonNegativeInteger(input.durationMs, `${field}.durationMs`),
        attempts: positiveInteger(input.attempts, `${field}.attempts`),
        cacheHit: requiredBoolean(input.cacheHit, `${field}.cacheHit`),
        evidenceDigests,
        diagnostics,
        ...(input.platformEvidence === undefined
            ? {}
            : { platformEvidence: parsePlatformVerificationEvidence(input.platformEvidence) }),
    };
}

export async function assertPlatformEvidenceIntegrity(results: readonly VerificationJobSuiteResultV1[]): Promise<void> {
    for (const result of results) {
        const evidence = result.platformEvidence;
        if (!evidence) {
            continue;
        }
        if (evidence.suiteId !== result.suiteId || evidence.outcome !== result.outcome) {
            throw invalidResult(
                `jobResult.results.${result.suiteId}.platformEvidence`,
                "must identify the same suite and outcome",
            );
        }
        const digest = await sha256Hex(canonicalJsonBytes(evidence));
        if (!result.evidenceDigests.includes(digest)) {
            throw invalidResult(
                `jobResult.results.${result.suiteId}.evidenceDigests`,
                "must contain the canonical platform evidence digest",
            );
        }
    }
}

export function assertTotalDiagnosticLimit(results: readonly VerificationJobSuiteResultV1[]): void {
    const bytes = results.reduce(
        (total, result) =>
            total + result.diagnostics.reduce((sum, entry) => sum + utf8.encode(entry.message).byteLength, 0),
        0,
    );
    if (bytes > MAX_TOTAL_DIAGNOSTIC_BYTES) {
        throw new IntegrationVerificationContractError(
            "limit_exceeded",
            `jobResult diagnostics exceed ${MAX_TOTAL_DIAGNOSTIC_BYTES} UTF-8 bytes`,
            "jobResult.results",
        );
    }
}

function parseDiagnostic(value: unknown, field: string): VerificationJobSuiteResultV1["diagnostics"][number] {
    const input = strictRecord(value, field, ["code", "message", "redacted"]);
    if (input.redacted !== true) {
        throw invalidResult(`${field}.redacted`, "must be true");
    }
    return {
        code: stableIdentifier(input.code, `${field}.code`),
        message: requiredText(input.message, `${field}.message`, MAX_DIAGNOSTIC_BYTES),
        redacted: true,
    };
}

function invalidResult(field: string, message: string): IntegrationVerificationContractError {
    return new IntegrationVerificationContractError("invalid_contract", `${field} ${message}`, field);
}
