import type { VerificationReport, VerificationSuiteResult } from "../../interfaces/reports/verification";
import { IntegrationVerificationContractError } from "../validation/errors";
import { assertUnique, boundedArray, strictRecord } from "../validation/structure";
import {
    nonNegativeInteger,
    oneOf,
    positiveInteger,
    requiredBoolean,
    requiredText,
    stableIdentifier,
} from "../validation/values";

const MAX_DIAGNOSTIC_BYTES = 16_384;
const MAX_TOTAL_DIAGNOSTIC_BYTES = 65_536;
const utf8 = new TextEncoder();

export function parseVerificationResults(value: unknown): VerificationSuiteResult[] {
    const results = boundedArray(value, "verificationReport.results", parseSuiteResult, { minimum: 1 });
    assertUnique(
        results.map((entry) => entry.suiteId),
        "verificationReport.results.suiteId",
    );
    const diagnosticBytes = results.reduce(
        (bytes, result) => bytes + utf8.encode(result.diagnostic?.message ?? "").byteLength,
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
        "outcome",
        "durationMs",
        "attempts",
        "cacheHit",
        "diagnostic",
    ]);
    return {
        suiteId: stableIdentifier(input.suiteId, `${field}.suiteId`),
        source: oneOf(input.source, `${field}.source`, ["platform", "author-contract", "author-conformance"] as const),
        required: requiredBoolean(input.required, `${field}.required`),
        outcome: oneOf(input.outcome, `${field}.outcome`, [
            "passed",
            "failed",
            "skipped",
            "infrastructure-failure",
        ] as const),
        durationMs: nonNegativeInteger(input.durationMs, `${field}.durationMs`),
        attempts: positiveInteger(input.attempts, `${field}.attempts`),
        cacheHit: requiredBoolean(input.cacheHit, `${field}.cacheHit`),
        ...(input.diagnostic === undefined
            ? {}
            : { diagnostic: parseDiagnostic(input.diagnostic, `${field}.diagnostic`) }),
    };
}

function parseDiagnostic(value: unknown, field: string): NonNullable<VerificationSuiteResult["diagnostic"]> {
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
