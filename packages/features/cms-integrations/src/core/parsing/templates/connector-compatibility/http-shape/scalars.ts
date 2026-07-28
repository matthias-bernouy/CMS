import { IntegrationInputError } from "../../../../errors";
import type {
    DeclarativeConnectorFunctionHttpDataShape,
    DeclarativeConnectorFunctionHttpStringFormat,
} from "../../../../../interfaces/Integration";
import { assertOnlyKeys } from "../values";

type ShapeCommon = Pick<DeclarativeConnectorFunctionHttpDataShape, "nullable">;
type StringShape = Extract<DeclarativeConnectorFunctionHttpDataShape, { type: "string" }>;
type NumberShape = Extract<DeclarativeConnectorFunctionHttpDataShape, { type: "number" }>;
type BooleanShape = Extract<DeclarativeConnectorFunctionHttpDataShape, { type: "boolean" }>;

const STRING_FORMATS = new Set<DeclarativeConnectorFunctionHttpStringFormat>([
    "date",
    "date-time",
    "email",
    "hostname",
    "ipv4",
    "ipv6",
    "uri",
    "uuid",
]);
const MAX_ENUM_VALUES = 256;
const MAX_ENUM_STRING_LENGTH = 8_192;
const MAX_PATTERN_LENGTH = 1_024;

export function parseStringShape(input: Record<string, unknown>, common: ShapeCommon, name: string): StringShape {
    assertOnlyKeys(input, ["type", "nullable", "enum", "format", "pattern", "minLength", "maxLength"], name);
    const minLength = optionalNonNegativeInteger(input.minLength, `${name}.minLength`);
    const maxLength = optionalNonNegativeInteger(input.maxLength, `${name}.maxLength`);
    assertOrderedBounds(minLength, maxLength, `${name}.minLength`, `${name}.maxLength`);
    return {
        type: "string",
        ...common,
        ...(input.enum !== undefined ? { enum: parseStringEnum(input.enum, `${name}.enum`) } : {}),
        ...(input.format !== undefined ? { format: parseFormat(input.format, `${name}.format`) } : {}),
        ...(input.pattern !== undefined ? { pattern: parsePattern(input.pattern, `${name}.pattern`) } : {}),
        ...(minLength !== undefined ? { minLength } : {}),
        ...(maxLength !== undefined ? { maxLength } : {}),
    };
}

export function parseNumberShape(input: Record<string, unknown>, common: ShapeCommon, name: string): NumberShape {
    assertOnlyKeys(input, ["type", "nullable", "enum", "minimum", "maximum"], name);
    const minimum = optionalFiniteNumber(input.minimum, `${name}.minimum`);
    const maximum = optionalFiniteNumber(input.maximum, `${name}.maximum`);
    assertOrderedBounds(minimum, maximum, `${name}.minimum`, `${name}.maximum`);
    return {
        type: "number",
        ...common,
        ...(input.enum !== undefined ? { enum: parseNumberEnum(input.enum, `${name}.enum`) } : {}),
        ...(minimum !== undefined ? { minimum } : {}),
        ...(maximum !== undefined ? { maximum } : {}),
    };
}

export function parseBooleanShape(input: Record<string, unknown>, common: ShapeCommon, name: string): BooleanShape {
    assertOnlyKeys(input, ["type", "nullable", "enum"], name);
    return {
        type: "boolean",
        ...common,
        ...(input.enum !== undefined ? { enum: parseBooleanEnum(input.enum, `${name}.enum`) } : {}),
    };
}

export function optionalNonNegativeInteger(value: unknown, name: string): number | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
        throw new IntegrationInputError(name, "must be a non-negative safe integer");
    }
    return value;
}

function optionalFiniteNumber(value: unknown, name: string): number | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new IntegrationInputError(name, "must be a finite number");
    }
    return Object.is(value, -0) ? 0 : value;
}

function assertOrderedBounds(
    minimum: number | undefined,
    maximum: number | undefined,
    minimumName: string,
    maximumName: string,
): void {
    if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
        throw new IntegrationInputError(maximumName, `must be greater than or equal to ${minimumName}`);
    }
}

function parseStringEnum(value: unknown, name: string): string[] {
    return parseEnum(value, name, (entry, entryName) => {
        if (typeof entry !== "string") {
            throw new IntegrationInputError(entryName, "must be a string");
        }
        if (entry.length > MAX_ENUM_STRING_LENGTH) {
            throw new IntegrationInputError(entryName, `must not exceed ${MAX_ENUM_STRING_LENGTH} characters`);
        }
        return entry;
    }).sort();
}

function parseNumberEnum(value: unknown, name: string): number[] {
    return parseEnum(value, name, (entry, entryName) => {
        const parsed = optionalFiniteNumber(entry, entryName);
        if (parsed === undefined) {
            throw new IntegrationInputError(entryName, "must be a finite number");
        }
        return parsed;
    }).sort((left, right) => left - right);
}

function parseBooleanEnum(value: unknown, name: string): boolean[] {
    return parseEnum(value, name, (entry, entryName) => {
        if (typeof entry !== "boolean") {
            throw new IntegrationInputError(entryName, "must be boolean");
        }
        return entry;
    }).sort((left, right) => Number(left) - Number(right));
}

function parseEnum<T extends string | number | boolean>(
    value: unknown,
    name: string,
    parseEntry: (entry: unknown, name: string) => T,
): T[] {
    if (!Array.isArray(value) || value.length === 0) {
        throw new IntegrationInputError(name, "must be a non-empty array");
    }
    if (value.length > MAX_ENUM_VALUES) {
        throw new IntegrationInputError(name, `must not contain more than ${MAX_ENUM_VALUES} values`);
    }
    const parsed = value.map((entry, index) => parseEntry(entry, `${name}.${index}`));
    const seen = new Set<T>();
    for (const entry of parsed) {
        if (seen.has(entry)) {
            throw new IntegrationInputError(name, `contains duplicate value ${JSON.stringify(entry)}`);
        }
        seen.add(entry);
    }
    return parsed;
}

function parseFormat(value: unknown, name: string): DeclarativeConnectorFunctionHttpStringFormat {
    if (typeof value !== "string" || !STRING_FORMATS.has(value as DeclarativeConnectorFunctionHttpStringFormat)) {
        throw new IntegrationInputError(name, `must be one of ${[...STRING_FORMATS].join(", ")}`);
    }
    return value as DeclarativeConnectorFunctionHttpStringFormat;
}

function parsePattern(value: unknown, name: string): string {
    if (typeof value !== "string") {
        throw new IntegrationInputError(name, "must be a string");
    }
    if (value.length > MAX_PATTERN_LENGTH) {
        throw new IntegrationInputError(name, `must not exceed ${MAX_PATTERN_LENGTH} characters`);
    }
    try {
        new RegExp(value);
    } catch {
        throw new IntegrationInputError(name, "must be a valid ECMAScript regular expression");
    }
    return value;
}
