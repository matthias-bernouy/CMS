import { ReleaseValidationError } from "../protocol/errors";
import { type ReleaseLimits } from "../protocol/limits";
import { expectArray, expectRecord, expectSafeInteger, expectString, rejectUnknownKeys } from "../protocol/values";
import type {
    CapabilityHttpMethod,
    HttpBinaryBodyBinding,
    HttpBodyPropertiesBinding,
    HttpBindingDefinition,
    HttpInputBinding,
} from "../../interfaces/HttpBinding";

const HTTP_METHODS = new Set<CapabilityHttpMethod>(["DELETE", "GET", "HEAD", "PATCH", "POST", "PUT"]);

export function parseHttpBinding(value: unknown, path: string, limits: Readonly<ReleaseLimits>): HttpBindingDefinition {
    const record = expectRecord(value, path, "invalid_binding");
    rejectUnknownKeys(record, ["transport", "method", "path", "input", "response"], path, "invalid_binding");
    if (record.transport !== "http") {
        throw new ReleaseValidationError("invalid_binding", "transport must be http", `${path}.transport`);
    }
    const method = expectString(record.method, `${path}.method`, "invalid_binding", 8) as CapabilityHttpMethod;
    if (!HTTP_METHODS.has(method)) {
        throw new ReleaseValidationError(
            "invalid_binding",
            `unsupported HTTP method ${JSON.stringify(method)}`,
            `${path}.method`,
        );
    }
    return {
        transport: "http",
        method,
        path: expectString(record.path, `${path}.path`, "invalid_binding", 1024),
        ...(record.input === undefined ? {} : { input: parseInput(record.input, `${path}.input`, limits) }),
        response: parseResponse(record.response, `${path}.response`),
    };
}

function parseInput(value: unknown, path: string, limits: Readonly<ReleaseLimits>): HttpInputBinding {
    const record = expectRecord(value, path, "invalid_binding");
    rejectUnknownKeys(record, ["path", "query", "headers", "body"], path, "invalid_binding");
    return {
        ...(record.path === undefined ? {} : { path: parseMap(record.path, `${path}.path`, limits) }),
        ...(record.query === undefined ? {} : { query: parseMap(record.query, `${path}.query`, limits) }),
        ...(record.headers === undefined ? {} : { headers: parseMap(record.headers, `${path}.headers`, limits) }),
        ...(record.body === undefined ? {} : { body: parseBody(record.body, `${path}.body`, limits) }),
    };
}

function parseMap(value: unknown, path: string, limits: Readonly<ReleaseLimits>): Readonly<Record<string, string>> {
    const record = expectRecord(value, path, "invalid_binding");
    const entries = Object.entries(record);
    if (entries.length > limits.maxProperties) {
        throw new ReleaseValidationError("invalid_binding", `must not exceed ${limits.maxProperties} mappings`, path);
    }
    const result: Record<string, string> = Object.create(null) as Record<string, string>;
    for (const [wireName, property] of entries) {
        result[wireName] = expectString(property, `${path}.${wireName}`, "invalid_binding", 64);
    }
    return result;
}

function parseBody(
    value: unknown,
    path: string,
    limits: Readonly<ReleaseLimits>,
): true | HttpBinaryBodyBinding | HttpBodyPropertiesBinding {
    if (value === true) {
        return true;
    }
    const record = expectRecord(value, path, "invalid_binding");
    if (Object.hasOwn(record, "binaryProperty")) {
        rejectUnknownKeys(record, ["binaryProperty"], path, "invalid_binding");
        return {
            binaryProperty: expectString(record.binaryProperty, `${path}.binaryProperty`, "invalid_binding", 64),
        };
    }
    rejectUnknownKeys(record, ["properties"], path, "invalid_binding");
    const source = expectArray(record.properties, `${path}.properties`, "invalid_binding");
    if (source.length > limits.maxProperties) {
        throw new ReleaseValidationError("invalid_binding", `must not exceed ${limits.maxProperties} properties`, path);
    }
    return {
        properties: source.map((item, index) =>
            expectString(item, `${path}.properties[${index}]`, "invalid_binding", 64),
        ),
    };
}

function parseResponse(value: unknown, path: string): HttpBindingDefinition["response"] {
    const record = expectRecord(value, path, "invalid_binding");
    rejectUnknownKeys(record, ["successStatuses", "contentTypes", "errorStatuses"], path, "invalid_binding");
    const statuses = expectArray(record.successStatuses, `${path}.successStatuses`, "invalid_binding");
    const contentTypes = expectArray(record.contentTypes, `${path}.contentTypes`, "invalid_binding");
    if (statuses.length === 0 || statuses.length > 16 || contentTypes.length > 16) {
        throw new ReleaseValidationError("invalid_binding", "response declares an invalid number of variants", path);
    }
    return {
        successStatuses: statuses.map((status, index) =>
            expectSafeInteger(status, `${path}.successStatuses[${index}]`, "invalid_binding"),
        ),
        contentTypes: contentTypes.map((contentType, index) =>
            expectString(contentType, `${path}.contentTypes[${index}]`, "invalid_binding", 127),
        ),
        errorStatuses: parseErrorStatuses(record.errorStatuses, `${path}.errorStatuses`),
    };
}

function parseErrorStatuses(value: unknown, path: string): Readonly<Record<string, number>> {
    const record = expectRecord(value, path, "invalid_binding");
    const entries = Object.entries(record);
    if (entries.length > 128) {
        throw new ReleaseValidationError("invalid_binding", "must not exceed 128 error mappings", path);
    }
    const result: Record<string, number> = Object.create(null) as Record<string, number>;
    for (const [code, status] of entries) {
        if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(code)) {
            throw new ReleaseValidationError("invalid_binding", `invalid error code ${JSON.stringify(code)}`, path);
        }
        result[code] = expectSafeInteger(status, `${path}.${code}`, "invalid_binding");
    }
    return result;
}
