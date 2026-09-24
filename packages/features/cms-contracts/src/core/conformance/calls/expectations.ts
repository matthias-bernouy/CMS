import type { CapabilityDefinition } from "../../../interfaces/ContractRelease";
import type { ConformanceExpectation, ConformanceCheck } from "../../../interfaces/Conformance";
import type { UlviaSchema } from "../../../interfaces/UlviaSchema";
import { parseErrorCode } from "../../parsing/identifiers";
import { ReleaseValidationError } from "../../protocol/errors";
import type { ReleaseLimits } from "../../protocol/limits";
import { expectArray, expectRecord, rejectUnknownKeys } from "../../protocol/values";
import { parsePointer, resolveConformancePath } from "./paths";
import { validateConformanceTemplate, type ConformanceTemplateContext } from "./templates";

export function parseExpectation(
    value: unknown,
    path: string,
    capability: CapabilityDefinition,
    context: ConformanceTemplateContext,
    limits: Readonly<ReleaseLimits>,
): ConformanceExpectation {
    const record = expectRecord(value, path, "invalid_contract");
    rejectUnknownKeys(record, ["kind", "code", "checks"], path, "invalid_contract");
    let schema: UlviaSchema | undefined;
    let code: string | undefined;
    if (record.kind === "success") {
        if (Object.hasOwn(record, "code")) {
            throw new ReleaseValidationError("invalid_contract", "success cannot declare an error code", path);
        }
        schema = capability.output;
    } else if (record.kind === "error") {
        code = parseErrorCode(record.code, `${path}.code`);
        const error = capability.errors.find((candidate) => candidate.code === code);
        if (!error) {
            throw new ReleaseValidationError("invalid_contract", "error code is not declared", `${path}.code`);
        }
        schema = error.output;
    } else {
        throw new ReleaseValidationError(
            "invalid_contract",
            "expectation kind must be success or error",
            `${path}.kind`,
        );
    }
    const source =
        record.checks === undefined ? undefined : expectArray(record.checks, `${path}.checks`, "invalid_contract");
    if (source && (source.length === 0 || source.length > limits.maxProperties || !schema)) {
        throw new ReleaseValidationError(
            "invalid_contract",
            "checks require an output schema and bounded entries",
            `${path}.checks`,
        );
    }
    const checks = source?.map((item, index) => parseCheck(item, `${path}.checks[${index}]`, schema!, context));
    if (checks && new Set(checks.map((check) => check.path)).size !== checks.length) {
        throw new ReleaseValidationError("invalid_contract", "duplicate assertion paths", `${path}.checks`);
    }
    for (const left of checks ?? []) {
        for (const right of checks ?? []) {
            if (left.path !== right.path && (left.path === "" || right.path.startsWith(`${left.path}/`))) {
                throw new ReleaseValidationError(
                    "invalid_contract",
                    "overlapping assertion paths are not supported",
                    `${path}.checks`,
                );
            }
        }
    }
    return code === undefined
        ? { kind: "success", ...(checks === undefined ? {} : { checks }) }
        : { kind: "error", code, ...(checks === undefined ? {} : { checks }) };
}

function parseCheck(
    value: unknown,
    path: string,
    schema: UlviaSchema,
    context: ConformanceTemplateContext,
): ConformanceCheck {
    const record = expectRecord(value, path, "invalid_contract");
    rejectUnknownKeys(record, ["path", "equals", "present"], path, "invalid_contract");
    const hasEquals = Object.hasOwn(record, "equals");
    const hasPresent = Object.hasOwn(record, "present");
    if (hasEquals === hasPresent || (hasPresent && record.present !== true)) {
        throw new ReleaseValidationError("invalid_contract", "assertion requires either equals or present: true", path);
    }
    const pointer = parsePointer(record.path, `${path}.path`);
    const field = resolveConformancePath(schema, pointer, `${path}.path`);
    if (hasPresent) {
        if (pointer === "") {
            throw new ReleaseValidationError("invalid_contract", "presence check must select a field", `${path}.path`);
        }
        return { path: pointer, present: true };
    }
    validateConformanceTemplate(field, record.equals, `${path}.equals`, context);
    return { path: pointer, equals: record.equals };
}
