import { ReleaseValidationError } from "../protocol/errors";
import type { CompiledHttpParameter } from "../../interfaces/HttpBinding";
import type { UlviaObjectSchema, UlviaSchema } from "../../interfaces/UlviaSchema";

const WIRE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/;
const HEADER_NAME_PATTERN = /^[a-z0-9!#$%&'*+.^_`|~-]+$/;
const FORBIDDEN_HEADERS = new Set([
    "accept",
    "accept-encoding",
    "authorization",
    "baggage",
    "connection",
    "content-encoding",
    "content-length",
    "content-type",
    "cookie",
    "expect",
    "forwarded",
    "host",
    "idempotency-key",
    "keep-alive",
    "origin",
    "proxy-authorization",
    "referer",
    "te",
    "trailer",
    "traceparent",
    "tracestate",
    "transfer-encoding",
    "upgrade",
    "user-agent",
    "via",
    "x-forwarded-for",
    "x-forwarded-host",
    "x-forwarded-proto",
    "x-real-ip",
]);
const FORBIDDEN_HEADER_PREFIXES = ["proxy-", "sec-", "x-cms-", "x-forwarded-", "x-ulvia-"];

export type ParameterLocation = "header" | "path" | "query";

export function compileParameterMap(
    mapping: Readonly<Record<string, string>> | undefined,
    location: ParameterLocation,
    input: UlviaObjectSchema,
    used: Set<string>,
    errorPath: string,
): readonly CompiledHttpParameter[] {
    const parameters = Object.entries(mapping ?? {}).map(([wireName, property]) => {
        validateWireName(wireName, location, errorPath);
        const schema = input.properties[property];
        if (!schema) {
            throw new ReleaseValidationError(
                "invalid_binding",
                `maps unknown input property ${JSON.stringify(property)}`,
                `${errorPath}.${wireName}`,
            );
        }
        if (used.has(property)) {
            throw new ReleaseValidationError(
                "invalid_binding",
                `input property ${JSON.stringify(property)} is mapped more than once`,
                `${errorPath}.${wireName}`,
            );
        }
        assertTransportScalar(schema, `${errorPath}.${wireName}`);
        if (schema.type === "string" && schema.sensitive && location !== "header") {
            const signedAccessException = location === "query" && wireName === "access" && property === "access";
            if (!signedAccessException) {
                throw new ReleaseValidationError(
                    "invalid_binding",
                    "sensitive parameters must use headers; only opaque signed access tokens may use the access query",
                    `${errorPath}.${wireName}`,
                );
            }
        }
        if (location === "path") {
            if (!input.required.includes(property) || ("nullable" in schema && schema.nullable)) {
                throw new ReleaseValidationError(
                    "invalid_binding",
                    `path property ${JSON.stringify(property)} must be required and non-nullable`,
                    `${errorPath}.${wireName}`,
                );
            }
        }
        used.add(property);
        return { encoding: "uri-component" as const, wireName, property };
    });
    return parameters.sort((left, right) =>
        left.wireName < right.wireName ? -1 : left.wireName > right.wireName ? 1 : 0,
    );
}

function validateWireName(name: string, location: ParameterLocation, path: string): void {
    if (location === "header") {
        if (!HEADER_NAME_PATTERN.test(name) || name !== name.toLowerCase()) {
            throw new ReleaseValidationError(
                "invalid_binding",
                "header names must be canonical lowercase tokens",
                path,
            );
        }
        if (FORBIDDEN_HEADERS.has(name) || FORBIDDEN_HEADER_PREFIXES.some((prefix) => name.startsWith(prefix))) {
            throw new ReleaseValidationError(
                "invalid_binding",
                `header ${JSON.stringify(name)} is gateway-owned`,
                path,
            );
        }
        return;
    }
    if (!WIRE_NAME_PATTERN.test(name)) {
        throw new ReleaseValidationError(
            "invalid_binding",
            `invalid ${location} parameter name ${JSON.stringify(name)}`,
            path,
        );
    }
}

function assertTransportScalar(schema: UlviaSchema, path: string): void {
    if (!new Set(["boolean", "integer", "number", "string"]).has(schema.type)) {
        throw new ReleaseValidationError("invalid_binding", "path, query, and header values must be scalar", path);
    }
}
