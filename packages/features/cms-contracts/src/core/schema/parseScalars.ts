import { ReleaseValidationError } from "../protocol/errors";
import { expectArray, expectString, rejectUnknownKeys, type UnknownRecord } from "../protocol/values";
import type {
    UlviaBooleanSchema,
    UlviaNullSchema,
    UlviaNumberSchema,
    UlviaStringFormat,
    UlviaStringSchema,
} from "../../interfaces/UlviaSchema";
import { assertRange, parseDescription, parseNullable, optionalBoundedInteger, type SchemaParseState } from "./context";
import { matchesStringFormat } from "./formats";

const STRING_FORMATS = new Set<UlviaStringFormat>(["date", "date-time", "email", "uri", "uuid"]);

export function parseStringSchema(record: UnknownRecord, path: string, state: SchemaParseState): UlviaStringSchema {
    rejectUnknownKeys(
        record,
        ["type", "description", "nullable", "enum", "format", "minLength", "maxLength"],
        path,
        "invalid_schema",
    );
    const minLength = optionalBoundedInteger(record.minLength, `${path}.minLength`, state.limits.maxStringLength);
    const maxLength = optionalBoundedInteger(record.maxLength, `${path}.maxLength`, state.limits.maxStringLength);
    if (maxLength === undefined) {
        throw new ReleaseValidationError("invalid_schema", "is required for bounded strings", `${path}.maxLength`);
    }
    assertRange(minLength, maxLength, path);
    const format = parseFormat(record.format, `${path}.format`);
    const values = parseStringEnum(record.enum, path, state, minLength, maxLength, format);
    const description = parseDescription(record, path);
    return {
        type: "string",
        ...(description ? { description } : {}),
        ...(parseNullable(record, path) ? { nullable: true as const } : {}),
        ...(values ? { enum: values } : {}),
        ...(format ? { format } : {}),
        ...(minLength === undefined ? {} : { minLength }),
        maxLength,
    };
}

export function parseNumberSchema(record: UnknownRecord, path: string): UlviaNumberSchema {
    rejectUnknownKeys(record, ["type", "description", "nullable", "minimum", "maximum"], path, "invalid_schema");
    const minimum = parseFiniteNumber(record.minimum, `${path}.minimum`);
    const maximum = parseFiniteNumber(record.maximum, `${path}.maximum`);
    if (
        record.type === "integer" &&
        [minimum, maximum].some((value) => value !== undefined && !Number.isSafeInteger(value))
    ) {
        throw new ReleaseValidationError("invalid_schema", "integer bounds must be safe integers", path);
    }
    assertRange(minimum, maximum, path);
    const description = parseDescription(record, path);
    return {
        type: record.type as "integer" | "number",
        ...(description ? { description } : {}),
        ...(parseNullable(record, path) ? { nullable: true as const } : {}),
        ...(minimum === undefined ? {} : { minimum }),
        ...(maximum === undefined ? {} : { maximum }),
    };
}

export function parseBooleanSchema(record: UnknownRecord, path: string): UlviaBooleanSchema {
    rejectUnknownKeys(record, ["type", "description", "nullable"], path, "invalid_schema");
    const description = parseDescription(record, path);
    return {
        type: "boolean",
        ...(description ? { description } : {}),
        ...(parseNullable(record, path) ? { nullable: true as const } : {}),
    };
}

export function parseNullSchema(record: UnknownRecord, path: string): UlviaNullSchema {
    rejectUnknownKeys(record, ["type", "description"], path, "invalid_schema");
    const description = parseDescription(record, path);
    return {
        type: "null",
        ...(description ? { description } : {}),
    };
}

function parseFormat(value: unknown, path: string): UlviaStringFormat | undefined {
    if (value === undefined) {
        return undefined;
    }
    const format = expectString(value, path, "invalid_schema", 32) as UlviaStringFormat;
    if (!STRING_FORMATS.has(format)) {
        throw new ReleaseValidationError("invalid_schema", `unsupported string format ${JSON.stringify(format)}`, path);
    }
    return format;
}

function parseFiniteNumber(value: unknown, path: string): number | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new ReleaseValidationError("invalid_schema", "must be a finite number", path);
    }
    return value;
}

function parseStringEnum(
    value: unknown,
    path: string,
    state: SchemaParseState,
    minimum: number | undefined,
    maximum: number,
    format: UlviaStringFormat | undefined,
): readonly string[] | undefined {
    if (value === undefined) {
        return undefined;
    }
    const source = expectArray(value, `${path}.enum`, "invalid_schema");
    if (source.length === 0 || source.length > state.limits.maxEnumValues) {
        throw new ReleaseValidationError(
            "invalid_schema",
            `must contain between 1 and ${state.limits.maxEnumValues} values`,
            `${path}.enum`,
        );
    }
    const values = source.map((item, index) => {
        const itemPath = `${path}.enum[${index}]`;
        if (typeof item !== "string") {
            throw new ReleaseValidationError("invalid_schema", "must be a string", itemPath);
        }
        if (item.length > state.limits.maxStringLength) {
            throw new ReleaseValidationError(
                "invalid_schema",
                `must not exceed ${state.limits.maxStringLength} characters`,
                itemPath,
            );
        }
        return item;
    });
    if (new Set(values).size !== values.length) {
        throw new ReleaseValidationError("invalid_schema", "must contain unique values", `${path}.enum`);
    }
    if (values.some((item) => item.length < (minimum ?? 0) || item.length > maximum)) {
        throw new ReleaseValidationError(
            "invalid_schema",
            "contains a value outside the declared length range",
            `${path}.enum`,
        );
    }
    const invalidFormatIndex = format ? values.findIndex((item) => !matchesStringFormat(item, format)) : -1;
    if (invalidFormatIndex >= 0) {
        throw new ReleaseValidationError(
            "invalid_schema",
            `must match format ${format}`,
            `${path}.enum[${invalidFormatIndex}]`,
        );
    }
    return values;
}
