import type { CapabilityDefinition, ContractFixtureAssetDefinition } from "../../interfaces/ContractRelease";
import type { ConformanceCall, ConformanceExpectation, ConformanceCheck } from "../../interfaces/Conformance";
import type { UlviaSchema } from "../../interfaces/UlviaSchema";
import { parseErrorCode, parseIdentifier } from "../parsing/identifiers";
import { ReleaseValidationError } from "../protocol/errors";
import type { ReleaseLimits } from "../protocol/limits";
import { expectArray, expectRecord, expectString, rejectUnknownKeys } from "../protocol/values";
import { parseActor } from "./actors";
import { resolveConformancePath } from "./paths";
import { validateConformanceTemplate, type ConformanceTemplateContext } from "./templates";

export function parseConformanceCall(
    value: unknown,
    path: string,
    capabilities: ReadonlyMap<string, CapabilityDefinition>,
    captures: Map<string, UlviaSchema>,
    assets: ReadonlyMap<string, ContractFixtureAssetDefinition>,
    referencedAssets: Set<string>,
    limits: Readonly<ReleaseLimits>,
): ConformanceCall {
    const record = expectRecord(value, path, "invalid_contract");
    rejectUnknownKeys(record, ["id", "capabilityId", "actor", "input", "expect", "captures"], path, "invalid_contract");
    const capabilityId = parseIdentifier(record.capabilityId, `${path}.capabilityId`);
    const capability = capabilities.get(capabilityId);
    if (!capability) {
        throw new ReleaseValidationError("invalid_contract", "unknown conformance capability", `${path}.capabilityId`);
    }
    const actor = parseActor(record.actor, `${path}.actor`, capability.access);
    const context: ConformanceTemplateContext = { assets, captures, referencedAssets };
    const input = expectRecord(record.input, `${path}.input`, "invalid_contract");
    validateConformanceTemplate(capability.input, input, `${path}.input`, context);
    const expect = parseExpectation(record.expect, `${path}.expect`, capability, context, limits);
    const declared =
        record.captures === undefined
            ? undefined
            : expectArray(record.captures, `${path}.captures`, "invalid_contract");
    if (expect.kind === "error" && declared !== undefined) {
        throw new ReleaseValidationError(
            "invalid_contract",
            "error calls cannot capture success output",
            `${path}.captures`,
        );
    }
    if (declared && declared.length > limits.maxProperties) {
        throw new ReleaseValidationError("invalid_contract", "too many captures", `${path}.captures`);
    }
    const parsedCaptures = declared?.map((item, index) => {
        const capturePath = `${path}.captures[${index}]`;
        const entry = expectRecord(item, capturePath, "invalid_contract");
        rejectUnknownKeys(entry, ["name", "path"], capturePath, "invalid_contract");
        const name = parseIdentifier(entry.name, `${capturePath}.name`);
        if (captures.has(name)) {
            throw new ReleaseValidationError("invalid_contract", "duplicate capture name", `${capturePath}.name`);
        }
        const pointer = parsePointer(entry.path, `${capturePath}.path`);
        const schema = resolveConformancePath(capability.output, pointer, `${capturePath}.path`, true);
        captures.set(name, schema);
        return { name, path: pointer };
    });
    return {
        id: parseIdentifier(record.id, `${path}.id`),
        capabilityId,
        actor,
        input,
        expect,
        ...(parsedCaptures === undefined ? {} : { captures: parsedCaptures }),
    };
}

function parseExpectation(
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

function parsePointer(value: unknown, path: string): string {
    if (value === "") {
        return "";
    }
    return expectString(value, path, "invalid_contract", 1024);
}
