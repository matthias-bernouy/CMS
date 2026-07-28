import type { VerificationReport, VerificationSuiteResult } from "../../interfaces/reports/verification";
import { IntegrationVerificationContractError } from "../validation/errors";
import { assertUnique, boundedArray, strictRecord } from "../validation/structure";
import {
    nonNegativeInteger,
    oneOf,
    positiveInteger,
    requiredBoolean,
    requiredText,
    sha256Digest,
    stableIdentifier,
} from "../validation/values";
import { parsePlatformVerificationEvidence } from "../verification/platform";

const MAX_DIAGNOSTIC_BYTES = 16_384;
const MAX_TOTAL_DIAGNOSTIC_BYTES = 65_536;
const MAX_DIAGNOSTICS_PER_SUITE = 8;
const MAX_EVIDENCE_DIGESTS_PER_SUITE = 64;
const utf8 = new TextEncoder();

export function parseVerificationResults(value: unknown): VerificationSuiteResult[] {
    const results = boundedArray(value, "verificationReport.results", parseSuiteResult, { minimum: 1 });
    assertUnique(
        results.map((entry) => entry.suiteId),
        "verificationReport.results.suiteId",
    );
    const diagnosticBytes = results.reduce(
        (bytes, result) =>
            bytes + result.diagnostics.reduce((sum, diagnostic) => sum + utf8.encode(diagnostic.message).byteLength, 0),
        0,
    );
    if (diagnosticBytes > MAX_TOTAL_DIAGNOSTIC_BYTES) {
        throw new IntegrationVerificationContractError(
            "limit_exceeded",
            `verification diagnostics exceed ${MAX_TOTAL_DIAGNOSTIC_BYTES} UTF-8 bytes`,
            "verificationReport.results",
        );
    }
    return results;
}

export function assertVerificationOutcome(report: VerificationReport): void {
    const expected = report.results.some((result) => result.outcome === "infrastructure-failure")
        ? "infrastructure-failure"
        : report.results.some(
                (result) => result.outcome === "failed" || (result.required && result.outcome === "skipped"),
            )
          ? "failed"
          : "passed";
    if (report.outcome !== expected) {
        throw invalid("verificationReport.outcome", `must be ${expected} for the recorded suite results`);
    }
}

export function assertActiveContractsExecuted(report: VerificationReport): void {
    const executed = new Set(
        report.results
            .filter((result) => result.source === "author-contract" && result.required)
            .map((result) => result.suiteId),
    );
    const missing = report.activeContracts.find((contract) => !executed.has(contract.contractId));
    if (missing) {
        throw new IntegrationVerificationContractError(
            "invalid_reference",
            `active contract ${missing.contractId} has no required execution result`,
            "verificationReport.activeContracts",
        );
    }
}

function parseSuiteResult(value: unknown, field: string): VerificationSuiteResult {
    const input = strictRecord(value, field, [
        "suiteId",
        "source",
        "required",
        "applicable",
        "outcome",
        "durationMs",
        "attempts",
        "cacheHit",
        "evidenceDigests",
        "diagnostics",
        "platformEvidence",
    ]);
    const outcome = oneOf(input.outcome, `${field}.outcome`, [
        "passed",
        "failed",
        "skipped",
        "not-applicable",
        "infrastructure-failure",
    ] as const);
    const evidenceDigests = boundedArray(input.evidenceDigests, `${field}.evidenceDigests`, sha256Digest, {
        maximum: MAX_EVIDENCE_DIGESTS_PER_SUITE,
    });
    assertUnique(evidenceDigests, `${field}.evidenceDigests`);
    if ((outcome === "passed" || outcome === "failed") && evidenceDigests.length === 0) {
        throw invalid(`${field}.evidenceDigests`, `must identify evidence for ${outcome}`);
    }
    const diagnostics = boundedArray(input.diagnostics, `${field}.diagnostics`, parseDiagnostic, {
        maximum: MAX_DIAGNOSTICS_PER_SUITE,
    });
    assertUnique(
        diagnostics.map((entry) => entry.code),
        `${field}.diagnostics.code`,
    );
    if ((outcome === "failed" || outcome === "infrastructure-failure") && diagnostics.length === 0) {
        throw invalid(`${field}.diagnostics`, `must explain ${outcome}`);
    }
    const applicable =
        input.applicable === undefined ? undefined : requiredBoolean(input.applicable, `${field}.applicable`);
    if ((applicable !== false) === (outcome === "not-applicable")) {
        throw invalid(`${field}.outcome`, "must be not-applicable exactly when applicable is false");
    }
    const platformEvidence =
        input.platformEvidence === undefined ? undefined : parsePlatformVerificationEvidence(input.platformEvidence);
    if (platformEvidence && (platformEvidence.suiteId !== input.suiteId || platformEvidence.outcome !== outcome)) {
        throw invalid(`${field}.platformEvidence`, "must identify the same suite and outcome");
    }
    return {
        suiteId: stableIdentifier(input.suiteId, `${field}.suiteId`),
        source: oneOf(input.source, `${field}.source`, ["platform", "author-contract", "author-conformance"] as const),
        required: requiredBoolean(input.required, `${field}.required`),
        ...(applicable === undefined ? {} : { applicable }),
        outcome,
        durationMs: nonNegativeInteger(input.durationMs, `${field}.durationMs`),
        attempts: positiveInteger(input.attempts, `${field}.attempts`),
        cacheHit: requiredBoolean(input.cacheHit, `${field}.cacheHit`),
        evidenceDigests,
        diagnostics,
        ...(platformEvidence ? { platformEvidence } : {}),
    };
}

function parseDiagnostic(value: unknown, field: string): VerificationSuiteResult["diagnostics"][number] {
    const input = strictRecord(value, field, ["code", "message", "redacted"]);
    if (input.redacted !== true) {
        throw invalid(`${field}.redacted`, "must be true");
    }
    return {
        code: stableIdentifier(input.code, `${field}.code`),
        message: requiredText(input.message, `${field}.message`, MAX_DIAGNOSTIC_BYTES),
        redacted: true,
    };
}

function invalid(field: string, message: string): IntegrationVerificationContractError {
    return new IntegrationVerificationContractError("invalid_contract", `${field} ${message}`, field);
}
