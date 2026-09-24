import type { CapabilityDefinition } from "../../../../interfaces/ContractRelease";
import type {
    ConformanceCallControls,
    ConformanceCompletion,
    ConformanceEventually,
} from "../../../../interfaces/ConformanceControls";
import { parseIdentifier } from "../../../parsing/identifiers";
import { ReleaseValidationError } from "../../../protocol/errors";
import type { ReleaseLimits } from "../../../protocol/limits";
import { expectRecord, expectSafeInteger, rejectUnknownKeys, type UnknownRecord } from "../../../protocol/values";
import { parseConformancePagination } from "./pagination";

export function parseConformanceControls(
    record: UnknownRecord,
    capability: CapabilityDefinition,
    path: string,
    limits: Readonly<ReleaseLimits>,
): ConformanceCallControls {
    const expect = expectRecord(record.expect, `${path}.expect`, "invalid_contract");
    const operation = capability.behavior.execution === "operation";
    const successfulQuery = !operation && capability.behavior.effect === "query" && expect.kind === "success";
    const invocationKey =
        record.invocationKey === undefined ? undefined : parseIdentifier(record.invocationKey, `${path}.invocationKey`);
    const replayOf = record.replayOf === undefined ? undefined : parseIdentifier(record.replayOf, `${path}.replayOf`);
    if (
        invocationKey !== undefined &&
        (capability.behavior.effect !== "command" || capability.behavior.idempotency !== "keyed")
    ) {
        fail("invocationKey is only valid for keyed commands", `${path}.invocationKey`);
    }
    if (replayOf !== undefined && (invocationKey === undefined || expect.kind !== "success")) {
        fail("replay requires an explicit invocationKey and a success expectation", `${path}.replayOf`);
    }
    if (record.completion !== undefined && !operation) {
        fail("completion is only valid for operations", `${path}.completion`);
    }
    if (operation && expect.kind === "success" && record.completion === undefined) {
        fail("operation success requires a bounded completion policy", `${path}.completion`);
    }
    if (record.eventually !== undefined) {
        if (!successfulQuery) {
            fail("eventually requires a successful sync query", `${path}.eventually`);
        }
        if (replayOf !== undefined || record.pagination !== undefined || record.completion !== undefined) {
            fail("eventually cannot be combined with replay, pagination, or completion", `${path}.eventually`);
        }
    }
    if (record.pagination !== undefined) {
        if (!successfulQuery) {
            fail("pagination requires a successful sync query", `${path}.pagination`);
        }
        if (record.captures !== undefined) {
            fail("pagination calls cannot capture an ambiguous page or aggregate", `${path}.captures`);
        }
    }
    return {
        ...(invocationKey === undefined ? {} : { invocationKey }),
        ...(replayOf === undefined ? {} : { replayOf }),
        ...(record.completion === undefined
            ? {}
            : { completion: parseCompletion(record.completion, `${path}.completion`, limits) }),
        ...(record.eventually === undefined
            ? {}
            : { eventually: parseEventually(record.eventually, `${path}.eventually`, limits) }),
        ...(record.pagination === undefined
            ? {}
            : { pagination: parseConformancePagination(record, capability, path, limits) }),
    };
}

function parseCompletion(value: unknown, path: string, limits: Readonly<ReleaseLimits>): ConformanceCompletion {
    const record = expectRecord(value, path, "invalid_contract");
    rejectUnknownKeys(record, ["timeoutMs", "pollIntervalMs"], path, "invalid_contract");
    const timeoutMs = positiveInteger(record.timeoutMs, `${path}.timeoutMs`, limits.maxConformanceDurationMs);
    const pollIntervalMs = positiveInteger(record.pollIntervalMs, `${path}.pollIntervalMs`, timeoutMs);
    if (Math.ceil(timeoutMs / pollIntervalMs) > limits.maxConformanceAttempts) {
        fail("completion policy exceeds the configured polling attempt limit", path);
    }
    return { timeoutMs, pollIntervalMs };
}

function parseEventually(value: unknown, path: string, limits: Readonly<ReleaseLimits>): ConformanceEventually {
    const record = expectRecord(value, path, "invalid_contract");
    rejectUnknownKeys(record, ["maxAttempts", "intervalMs"], path, "invalid_contract");
    const maxAttempts = positiveInteger(record.maxAttempts, `${path}.maxAttempts`, limits.maxConformanceAttempts);
    const intervalMs = positiveInteger(record.intervalMs, `${path}.intervalMs`, limits.maxConformanceDurationMs);
    if (maxAttempts - 1 > Math.floor(limits.maxConformanceDurationMs / intervalMs)) {
        fail("eventual query policy exceeds the configured wait duration", path);
    }
    return { maxAttempts, intervalMs };
}

function positiveInteger(value: unknown, path: string, maximum: number): number {
    const parsed = expectSafeInteger(value, path, "invalid_contract");
    if (parsed < 1 || parsed > maximum) {
        fail(`must be between 1 and ${maximum}`, path);
    }
    return parsed;
}

function fail(message: string, path: string): never {
    throw new ReleaseValidationError("invalid_contract", message, path);
}
