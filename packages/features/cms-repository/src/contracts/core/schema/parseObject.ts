import { ReleaseValidationError } from "../protocol/errors";
import { expectArray, expectRecord, expectString, rejectUnknownKeys, type UnknownRecord } from "../protocol/values";
import type { UlviaObjectSchema, UlviaSchema } from "../../interfaces/UlviaSchema";
import {
    assertRange,
    parseDescription,
    parseNullable,
    PROPERTY_NAME_PATTERN,
    optionalBoundedInteger,
    type SchemaParseState,
} from "./context";
import type { NestedSchemaParser } from "./parseContainers";

export function parseObjectSchema(
    record: UnknownRecord,
    path: string,
    state: SchemaParseState,
    depth: number,
    parseNested: NestedSchemaParser,
): UlviaObjectSchema {
    rejectUnknownKeys(
        record,
        ["type", "description", "nullable", "properties", "required", "minProperties", "maxProperties"],
        path,
        "invalid_schema",
    );
    const source = expectRecord(record.properties, `${path}.properties`, "invalid_schema");
    const entries = Object.entries(source);
    if (entries.length > state.limits.maxProperties) {
        throw new ReleaseValidationError(
            "invalid_schema",
            `must not exceed ${state.limits.maxProperties} properties`,
            `${path}.properties`,
        );
    }
    const properties: Record<string, UlviaSchema> = Object.create(null) as Record<string, UlviaSchema>;
    for (const [name, value] of entries) {
        if (!PROPERTY_NAME_PATTERN.test(name)) {
            throw new ReleaseValidationError(
                "invalid_schema",
                `invalid property name ${JSON.stringify(name)}`,
                `${path}.properties`,
            );
        }
        properties[name] = parseNested(value, `${path}.properties.${name}`, state, depth + 1);
    }
    const required = parseRequired(record.required, path, properties);
    const minProperties = optionalBoundedInteger(record.minProperties, `${path}.minProperties`, entries.length);
    const maxProperties = optionalBoundedInteger(record.maxProperties, `${path}.maxProperties`, entries.length);
    assertRange(minProperties, maxProperties, path);
    if (maxProperties !== undefined && required.length > maxProperties) {
        throw new ReleaseValidationError("invalid_schema", "required fields exceed maxProperties", path);
    }
    const description = parseDescription(record, path);
    return {
        type: "object",
        properties,
        required,
        ...(description ? { description } : {}),
        ...(parseNullable(record, path) ? { nullable: true } : {}),
        ...(minProperties === undefined ? {} : { minProperties }),
        ...(maxProperties === undefined ? {} : { maxProperties }),
    };
}

function parseRequired(
    value: unknown,
    path: string,
    properties: Readonly<Record<string, UlviaSchema>>,
): readonly string[] {
    const source = value === undefined ? [] : expectArray(value, `${path}.required`, "invalid_schema");
    const required = source.map((item, index) =>
        expectString(item, `${path}.required[${index}]`, "invalid_schema", 64),
    );
    if (new Set(required).size !== required.length) {
        throw new ReleaseValidationError("invalid_schema", "must not contain duplicates", `${path}.required`);
    }
    for (const name of required) {
        if (!Object.hasOwn(properties, name)) {
            throw new ReleaseValidationError(
                "invalid_schema",
                `references unknown property ${JSON.stringify(name)}`,
                `${path}.required`,
            );
        }
    }
    return required;
}
