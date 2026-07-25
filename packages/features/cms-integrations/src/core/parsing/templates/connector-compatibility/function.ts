import { HTTP_METHODS, isValidResponseStatus, type HTTPMethod } from "@bernouy/cms-sources";
import { IntegrationInputError } from "../../../errors";
import type {
    DeclarativeConnectorFunctionCompatibility,
    DeclarativeConnectorFunctionHttpEndpointContract,
    DeclarativeConnectorFunctionHttpResponseContract,
} from "../../../../interfaces/Integration";
import { parseConnectorFunctionHttpDataShape } from "./http-shape";
import { array, assertOnlyKeys, assertUnique, record, requiredText } from "./values";

const HTTP_FIELD_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const MAX_HTTP_FIELD_NAME_LENGTH = 256;

export function parseConnectorFunctionCompatibility(
    value: unknown,
    name: string,
): DeclarativeConnectorFunctionCompatibility {
    const input = record(value, name);
    assertOnlyKeys(input, ["http"], name);
    return {
        ...(input.http !== undefined ? { http: parseHttpContract(input.http, `${name}.http`) } : {}),
    };
}

function parseHttpContract(
    value: unknown,
    name: string,
): NonNullable<DeclarativeConnectorFunctionCompatibility["http"]> {
    const input = record(value, name);
    assertOnlyKeys(input, ["endpoints", "requiredSecrets"], name);
    const endpoints = array(input.endpoints, `${name}.endpoints`, parseEndpoint).sort(compareEndpoints);
    assertUnique(
        endpoints.map((endpoint) => `${endpoint.method} ${endpoint.route}`),
        `${name}.endpoints`,
        "method and route",
    );
    return {
        endpoints,
        requiredSecrets: parseSortedUniqueText(input.requiredSecrets ?? [], `${name}.requiredSecrets`, "secret"),
    };
}

function parseEndpoint(value: unknown, name: string): DeclarativeConnectorFunctionHttpEndpointContract {
    const input = record(value, name);
    assertOnlyKeys(input, ["route", "method", "requiredInputs", "requiredHeaders", "responses"], name);
    const route = parseRoute(input.route, `${name}.route`);
    const method = parseMethod(input.method, `${name}.method`);
    const responses = array(input.responses, `${name}.responses`, parseResponse).sort((left, right) =>
        left.status.localeCompare(right.status),
    );
    assertUnique(
        responses.map((response) => response.status),
        `${name}.responses`,
        "status",
    );
    return {
        route,
        method,
        requiredInputs: parseSortedUniqueText(input.requiredInputs ?? [], `${name}.requiredInputs`, "input"),
        requiredHeaders: parseRequiredHeaders(input.requiredHeaders ?? [], `${name}.requiredHeaders`),
        responses,
    };
}

function parseResponse(value: unknown, name: string): DeclarativeConnectorFunctionHttpResponseContract {
    const input = record(value, name);
    assertOnlyKeys(input, ["status", "body"], name);
    const status = requiredText(input.status, `${name}.status`);
    if (!isValidResponseStatus(status)) {
        throw new IntegrationInputError(`${name}.status`, "must be default or an HTTP status from 100 to 599");
    }
    return {
        status,
        ...(input.body !== undefined ? { body: parseConnectorFunctionHttpDataShape(input.body, `${name}.body`) } : {}),
    };
}

function parseRoute(value: unknown, name: string): string {
    const route = requiredText(value, name);
    if (!route.startsWith("/") || /[\s?#]/.test(route)) {
        throw new IntegrationInputError(name, "must be an absolute route path without whitespace, query, or fragment");
    }
    return route;
}

function parseMethod(value: unknown, name: string): HTTPMethod {
    const method = requiredText(value, name).toUpperCase();
    if (!(HTTP_METHODS as readonly string[]).includes(method)) {
        throw new IntegrationInputError(name, `must be one of ${HTTP_METHODS.join(", ")}`);
    }
    return method as HTTPMethod;
}

function parseSortedUniqueText(value: unknown, name: string, label: string): string[] {
    const values = array(value, name, requiredText).sort();
    assertUnique(values, name, label);
    return values;
}

function parseRequiredHeaders(value: unknown, name: string): string[] {
    const headers = array(value, name, parseHeaderName).sort();
    assertUnique(headers, name, "header");
    return headers;
}

function parseHeaderName(value: unknown, name: string): string {
    if (typeof value !== "string" || value.length === 0) {
        throw new IntegrationInputError(name, "must be a non-empty HTTP field name");
    }
    if (value.length > MAX_HTTP_FIELD_NAME_LENGTH || !HTTP_FIELD_NAME.test(value)) {
        throw new IntegrationInputError(name, "must be a valid HTTP field name");
    }
    return value.toLowerCase();
}

function compareEndpoints(
    left: DeclarativeConnectorFunctionHttpEndpointContract,
    right: DeclarativeConnectorFunctionHttpEndpointContract,
): number {
    return left.route.localeCompare(right.route) || left.method.localeCompare(right.method);
}
