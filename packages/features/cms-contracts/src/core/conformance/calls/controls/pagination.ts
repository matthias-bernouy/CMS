import type { CapabilityDefinition } from "../../../../interfaces/ContractRelease";
import type { ConformancePagination } from "../../../../interfaces/ConformanceControls";
import { firstSchemaSubsetViolation } from "../../../compatibility/schemaAcceptance";
import { ReleaseValidationError } from "../../../protocol/errors";
import type { ReleaseLimits } from "../../../protocol/limits";
import {
    expectRecord,
    expectSafeInteger,
    expectString,
    rejectUnknownKeys,
    type UnknownRecord,
} from "../../../protocol/values";
import { resolveConformancePath } from "../paths";

export function parseConformancePagination(
    call: UnknownRecord,
    capability: CapabilityDefinition,
    path: string,
    limits: Readonly<ReleaseLimits>,
): ConformancePagination {
    const policyPath = `${path}.pagination`;
    const record = expectRecord(call.pagination, policyPath, "invalid_contract");
    rejectUnknownKeys(
        record,
        ["itemsPath", "cursorPath", "cursorInput", "maxPages", "uniqueBy"],
        policyPath,
        "invalid_contract",
    );
    const itemsPath = parsePointer(record.itemsPath, `${policyPath}.itemsPath`);
    const cursorPath = parsePointer(record.cursorPath, `${policyPath}.cursorPath`);
    const cursorInput = expectString(record.cursorInput, `${policyPath}.cursorInput`, "invalid_contract", 64);
    const maxPages = expectSafeInteger(record.maxPages, `${policyPath}.maxPages`, "invalid_contract");
    if (maxPages < 1 || maxPages > limits.maxConformancePages) {
        fail(`maxPages must be between 1 and ${limits.maxConformancePages}`, `${policyPath}.maxPages`);
    }
    const items = resolveConformancePath(capability.output, itemsPath, `${policyPath}.itemsPath`, true);
    if (items.type !== "array" || items.nullable) {
        fail("itemsPath must select a guaranteed non-null array", `${policyPath}.itemsPath`);
    }
    const cursor = resolveConformancePath(capability.output, cursorPath, `${policyPath}.cursorPath`, true);
    if (cursor.type !== "string" || !cursor.nullable) {
        fail(
            "cursorPath must select a guaranteed nullable string with null as the terminal marker",
            `${policyPath}.cursorPath`,
        );
    }
    const input = capability.input;
    const inputCursor = Object.hasOwn(input.properties, cursorInput) ? input.properties[cursorInput] : undefined;
    if (
        inputCursor?.type !== "string" ||
        !inputCursor.nullable ||
        input.required.includes(cursorInput) ||
        (input.minProperties ?? 0) >= Object.keys(input.properties).length
    ) {
        fail("cursorInput must identify an optional nullable string property", `${policyPath}.cursorInput`);
    }
    const violation = firstSchemaSubsetViolation(cursor, inputCursor, `${policyPath}.cursorInput`);
    if (violation) {
        fail("output cursors are not proven valid for the input cursor schema", violation);
    }
    assertContinuationFits(call.input, capability, cursorInput, `${policyPath}.cursorInput`);
    const uniqueBy =
        record.uniqueBy === undefined ? undefined : parsePointer(record.uniqueBy, `${policyPath}.uniqueBy`);
    if (uniqueBy !== undefined) {
        const identity = resolveConformancePath(items.items, uniqueBy, `${policyPath}.uniqueBy`, true);
        if ((identity.type !== "string" && identity.type !== "integer") || identity.nullable) {
            fail("uniqueBy must select a guaranteed non-null string or integer", `${policyPath}.uniqueBy`);
        }
    }
    return { itemsPath, cursorPath, cursorInput, maxPages, ...(uniqueBy === undefined ? {} : { uniqueBy }) };
}

function assertContinuationFits(
    value: unknown,
    capability: CapabilityDefinition,
    cursorInput: string,
    path: string,
): void {
    let record = expectRecord(value, path, "invalid_contract");
    if (Object.keys(record).length === 1 && Object.hasOwn(record, "$literal")) {
        record = expectRecord(record.$literal, path, "invalid_contract");
    } else if (Object.hasOwn(record, "$capture")) {
        fail("pagination input must expose its literal root properties, not capture the entire input", path);
    }
    const maximum = capability.input.maxProperties ?? Object.keys(capability.input.properties).length;
    const count = Object.keys(record).length + (Object.hasOwn(record, cursorInput) ? 0 : 1);
    if (count > maximum) {
        fail("adding a continuation cursor would exceed input maxProperties", path);
    }
}

function parsePointer(value: unknown, path: string): string {
    return value === "" ? "" : expectString(value, path, "invalid_contract", 1024);
}

function fail(message: string, path: string): never {
    throw new ReleaseValidationError("invalid_contract", message, path);
}
