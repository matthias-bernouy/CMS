import type {
    CapabilityDefinition,
    ContractFixtureAssetDefinition,
    ContractRelease,
} from "../../../interfaces/ContractRelease";
import type { ConformanceCall } from "../../../interfaces/Conformance";
import type { UlviaSchema } from "../../../interfaces/UlviaSchema";
import { parseIdentifier } from "../../parsing/identifiers";
import { ReleaseValidationError } from "../../protocol/errors";
import type { ReleaseLimits } from "../../protocol/limits";
import { expectArray, expectRecord, rejectUnknownKeys } from "../../protocol/values";
import { parseActor } from "./actors";
import { parsePointer, resolveConformancePath } from "./paths";
import { parseExpectation } from "./expectations";
import { parseConformanceControls } from "./controls/parseControls";
import { validateConformanceTemplate, type ConformanceTemplateContext } from "./templates";

export function parseConformanceCall(
    value: unknown,
    path: string,
    capabilities: ReadonlyMap<string, CapabilityDefinition>,
    captures: Map<string, UlviaSchema>,
    assets: ReadonlyMap<string, ContractFixtureAssetDefinition>,
    referencedAssets: Set<string>,
    limits: Readonly<ReleaseLimits>,
    dependencies: ReadonlyMap<string, ContractRelease>,
): ConformanceCall {
    const record = expectRecord(value, path, "invalid_contract");
    rejectUnknownKeys(
        record,
        [
            "id",
            "capabilityId",
            "dependencyContractId",
            "actor",
            "input",
            "expect",
            "captures",
            "invocationKey",
            "replayOf",
            "completion",
            "eventually",
            "pagination",
        ],
        path,
        "invalid_contract",
    );
    const capabilityId = parseIdentifier(record.capabilityId, `${path}.capabilityId`);
    const dependencyContractId =
        record.dependencyContractId === undefined
            ? undefined
            : parseIdentifier(record.dependencyContractId, `${path}.dependencyContractId`, 96);
    const capability =
        dependencyContractId === undefined
            ? capabilities.get(capabilityId)
            : dependencies.get(dependencyContractId)?.capabilities.find((candidate) => candidate.id === capabilityId);
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
        const asserted = expect.kind === "success" && expect.checks?.some((check) => check.path === pointer);
        const schema = resolveConformancePath(capability.output, pointer, `${capturePath}.path`, !asserted);
        captures.set(name, schema);
        return { name, path: pointer };
    });
    return {
        id: parseIdentifier(record.id, `${path}.id`),
        capabilityId,
        ...(dependencyContractId === undefined ? {} : { dependencyContractId }),
        actor,
        input,
        expect,
        ...parseConformanceControls(record, capability, path, limits),
        ...(parsedCaptures === undefined ? {} : { captures: parsedCaptures }),
    };
}
