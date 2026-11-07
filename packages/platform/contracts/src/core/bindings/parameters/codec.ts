import type { HttpParameterValue } from "../../../interfaces/HttpBinding";
import type { UlviaScalarSchema } from "../../../interfaces/UlviaSchema";
import { canonicalizeIJson } from "../../protocol/canonical";
import { parseStrictJson } from "../../protocol/json";
import { SchemaValueError, validateSchemaValue } from "../../schema/validateValue";

const ENCODED_COMPONENT = /^(?:[A-Za-z0-9_.!~*'()-]|%[0-9A-Fa-f]{2})*$/;

/** Undefined is omission; required-property validation belongs to the complete input schema. */
export function encodeHttpParameter(schema: UlviaScalarSchema, value: unknown): string | undefined {
    if (value === undefined) {
        return undefined;
    }
    assertScalar(value);
    validateSchemaValue(schema, value);
    if (schema.type === "string") {
        canonicalScalar(value);
        const wireValue = schema.nullable ? (value === null ? "~n" : `~s${String(value)}`) : String(value);
        return encodeURIComponent(wireValue);
    }
    return encodeURIComponent(canonicalScalar(value));
}

/** Receives a raw wire component, before any URL, query-string or framework decoding. */
export function decodeHttpParameter(schema: UlviaScalarSchema, encoded: unknown): HttpParameterValue | undefined {
    if (encoded === undefined) {
        return undefined;
    }
    const maximum = schema.type === "string" ? Math.max(64, 18 * schema.maxLength + 9) : 64;
    if (typeof encoded !== "string" || encoded.length > maximum || !ENCODED_COMPONENT.test(encoded)) {
        throw new SchemaValueError("must be a bounded percent-encoded JSON scalar");
    }
    let value: unknown;
    try {
        const decoded = decodeURIComponent(encoded);
        if (schema.type === "string") {
            value = schema.nullable ? (decoded === "~n" ? null : requiredNullableString(decoded)) : decoded;
        } else {
            value = parseStrictJson(decoded, maximum, 1);
        }
    } catch {
        throw new SchemaValueError("must contain one valid URI-encoded scalar");
    }
    assertScalar(value);
    validateSchemaValue(schema, value);
    canonicalScalar(value);
    return value;
}

/** Encodes one explicitly declared, plain HTTP field value without URI escaping. */
export function encodeHttpFieldParameter(schema: UlviaScalarSchema, value: unknown): string | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (schema.type !== "string" || schema.nullable || typeof value !== "string") {
        throw new SchemaValueError("plain HTTP fields require a non-nullable string");
    }
    validateSchemaValue(schema, value);
    canonicalScalar(value);
    assertHttpFieldValue(value, schema.maxLength);
    return value;
}

/** Decodes one raw field value after the HTTP stack has parsed its header line. */
export function decodeHttpFieldParameter(schema: UlviaScalarSchema, value: unknown): string | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (schema.type !== "string" || schema.nullable || typeof value !== "string") {
        throw new SchemaValueError("plain HTTP fields require a non-nullable string");
    }
    assertHttpFieldValue(value, schema.maxLength);
    validateSchemaValue(schema, value);
    canonicalScalar(value);
    return value;
}

function assertHttpFieldValue(value: string, maximum: number): void {
    if (value.length > maximum || value !== value.trim() || !/^[\x20-\x7e]*$/u.test(value)) {
        throw new SchemaValueError("must be a bounded visible-ASCII HTTP field value without surrounding whitespace");
    }
}

function requiredNullableString(value: string): string {
    if (!value.startsWith("~s")) {
        throw new SchemaValueError("nullable strings must use their URI component marker");
    }
    return value.slice(2);
}

function assertScalar(value: unknown): asserts value is HttpParameterValue {
    if (value !== null && typeof value !== "boolean" && typeof value !== "number" && typeof value !== "string") {
        throw new SchemaValueError("must be a JSON scalar");
    }
}

function canonicalScalar(value: HttpParameterValue): string {
    try {
        return canonicalizeIJson(value, 1);
    } catch {
        throw new SchemaValueError("must be an interoperable JSON scalar with valid Unicode and finite safe numbers");
    }
}
