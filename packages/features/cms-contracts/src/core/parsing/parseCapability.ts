import { ReleaseValidationError } from "../protocol/errors";
import { type ReleaseLimits } from "../protocol/limits";
import {
    expectArray,
    expectBoolean,
    expectRecord,
    expectString,
    optionalString,
    rejectUnknownKeys,
} from "../protocol/values";
import type {
    CapabilityAccess,
    CapabilityBehavior,
    CapabilityDefinition,
    CapabilityErrorDefinition,
    CapabilityExecution,
    ContractFixtureAssetDefinition,
} from "../../interfaces/ContractRelease";
import type { UlviaObjectSchema } from "../../interfaces/UlviaSchema";
import { type SchemaParseState } from "../schema/context";
import { parseSchemaAt } from "../schema/parseSchema";
import { parseErrorCode, parseIdentifier } from "./identifiers";
import { parseHttpBinding } from "./parseHttpBinding";
import { parseCapabilityDeprecation } from "./parseDeprecation";
import { parseMocks } from "./parseMocks";
import { parseCapabilityRequirements } from "./parseCapabilityRequirements";

const ACCESS_LEVELS = new Set<CapabilityAccess>(["admin", "authenticated", "public"]);
const EFFECTS = new Set(["command", "query"] as const);
const EXECUTIONS = new Set<CapabilityExecution>(["operation", "sync"]);
const IDEMPOTENCY = new Set(["keyed", "natural", "none"] as const);

export function parseCapability(
    value: unknown,
    path: string,
    limits: Readonly<ReleaseLimits>,
    schemaState: SchemaParseState,
    assets: ReadonlyMap<string, ContractFixtureAssetDefinition>,
    referencedAssets: Set<string>,
): CapabilityDefinition {
    const record = expectRecord(value, path, "invalid_contract");
    rejectUnknownKeys(
        record,
        [
            "id",
            "description",
            "access",
            "behavior",
            "deprecation",
            "input",
            "output",
            "errors",
            "binding",
            "mocks",
            "requires",
        ],
        path,
        "invalid_contract",
    );
    const input = parseSchemaAt(record.input, `${path}.input`, schemaState, 1);
    if (input.type !== "object") {
        throw new ReleaseValidationError(
            "invalid_contract",
            "capability input must be an object schema",
            `${path}.input`,
        );
    }
    if (input.nullable) {
        throw new ReleaseValidationError(
            "invalid_contract",
            "capability input root must be non-nullable",
            `${path}.input.nullable`,
        );
    }
    const description = optionalString(record.description, `${path}.description`, "invalid_contract", 4096);
    const output = parseSchemaAt(record.output, `${path}.output`, schemaState, 1);
    const errors = parseErrors(record.errors, `${path}.errors`, schemaState);
    return {
        id: parseIdentifier(record.id, `${path}.id`),
        ...(description ? { description } : {}),
        access: enumValue(record.access, `${path}.access`, ACCESS_LEVELS),
        behavior: parseBehavior(record.behavior, `${path}.behavior`),
        input: input as UlviaObjectSchema,
        output,
        errors,
        binding: parseHttpBinding(record.binding, `${path}.binding`, limits),
        ...(record.requires === undefined
            ? {}
            : { requires: parseCapabilityRequirements(record.requires, `${path}.requires`, limits) }),
        ...(record.mocks === undefined
            ? {}
            : {
                  mocks: parseMocks(
                      record.mocks,
                      `${path}.mocks`,
                      input,
                      output,
                      errors,
                      assets,
                      referencedAssets,
                      limits,
                  ),
              }),
        ...(record.deprecation === undefined
            ? {}
            : { deprecation: parseCapabilityDeprecation(record.deprecation, `${path}.deprecation`) }),
    };
}

function parseBehavior(value: unknown, path: string): CapabilityBehavior {
    const record = expectRecord(value, path, "invalid_contract");
    rejectUnknownKeys(record, ["effect", "idempotency", "execution"], path, "invalid_contract");
    const effect = enumValue(record.effect, `${path}.effect`, EFFECTS);
    const execution = enumValue(record.execution, `${path}.execution`, EXECUTIONS);
    if (effect === "query") {
        if (Object.hasOwn(record, "idempotency")) {
            throw new ReleaseValidationError(
                "invalid_contract",
                "queries must not declare idempotency",
                `${path}.idempotency`,
            );
        }
        return { effect, execution };
    }
    return { effect, execution, idempotency: enumValue(record.idempotency, `${path}.idempotency`, IDEMPOTENCY) };
}

function parseErrors(
    value: unknown,
    path: string,
    schemaState: SchemaParseState,
): readonly CapabilityErrorDefinition[] {
    const source = value === undefined ? [] : expectArray(value, path, "invalid_contract");
    if (source.length > 128) {
        throw new ReleaseValidationError("invalid_contract", "must not exceed 128 declared errors", path);
    }
    const errors = source.map((item, index) => {
        const itemPath = `${path}[${index}]`;
        const record = expectRecord(item, itemPath, "invalid_contract");
        rejectUnknownKeys(record, ["code", "description", "retryable", "output"], itemPath, "invalid_contract");
        const description = optionalString(record.description, `${itemPath}.description`, "invalid_contract", 4096);
        return {
            code: parseErrorCode(record.code, `${itemPath}.code`),
            ...(description ? { description } : {}),
            retryable: expectBoolean(record.retryable, `${itemPath}.retryable`, "invalid_contract"),
            ...(record.output === undefined
                ? {}
                : { output: parseSchemaAt(record.output, `${itemPath}.output`, schemaState, 1) }),
        };
    });
    if (new Set(errors.map((error) => error.code)).size !== errors.length) {
        throw new ReleaseValidationError("invalid_contract", "contains duplicate error codes", path);
    }
    return errors;
}

function enumValue<T extends string>(value: unknown, path: string, accepted: ReadonlySet<T>): T {
    const parsed = expectString(value, path, "invalid_contract", 32) as T;
    if (!accepted.has(parsed)) {
        throw new ReleaseValidationError("invalid_contract", `unsupported value ${JSON.stringify(parsed)}`, path);
    }
    return parsed;
}
