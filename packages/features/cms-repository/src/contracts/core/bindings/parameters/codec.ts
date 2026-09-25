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
    return encodeURIComponent(canonicalScalar(value));
}

/** Receives a raw wire component, before any URL, query-string or framework decoding. */
export function decodeHttpParameter(schema: UlviaScalarSchema, encoded: unknown): HttpParameterValue | undefined {
    if (encoded === undefined) {
        return undefined;
    }
    const maximum = schema.type === "string" ? Math.max(64, 18 * schema.maxLength + 6) : 64;
    if (typeof encoded !== "string" || encoded.length > maximum || !ENCODED_COMPONENT.test(encoded)) {
        throw new SchemaValueError("must be a bounded percent-encoded JSON scalar");
    }
    let value: unknown;
    try {
        value = parseStrictJson(decodeURIComponent(encoded), maximum, 1);
    } catch {
        throw new SchemaValueError("must contain exactly one percent-encoded JSON scalar");
    }
    assertScalar(value);
    validateSchemaValue(schema, value);
    canonicalScalar(value);
    return value;
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
