import {
    HTTP_METHODS,
    isValidResponseStatus,
    parseDataShape,
    type DataShape,
    type HTTPMethod,
} from "@bernouy/cms-sources";
import { IntegrationInputError } from "../../../errors";
import type {
    DeclarativeConnectorFunctionCompatibility,
    DeclarativeConnectorFunctionHttpEndpointContract,
    DeclarativeConnectorFunctionHttpResponseContract,
} from "../../../../interfaces/Integration";
import { array, assertOnlyKeys, assertUnique, record, requiredText } from "./values";

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
        requiredHeaders: parseSortedUniqueText(input.requiredHeaders ?? [], `${name}.requiredHeaders`, "header"),
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
        ...(input.body !== undefined ? { body: normalizeShape(parseDataShape(input.body, `${name}.body`)) } : {}),
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

function normalizeShape(shape: DataShape): DataShape {
    const properties = shape.properties
        ? Object.fromEntries(
              Object.entries(shape.properties)
                  .sort(([left], [right]) => left.localeCompare(right))
                  .map(([key, value]) => [key, normalizeShape(value)]),
          )
        : undefined;
    return {
        type: shape.type,
        ...(shape.nullable !== undefined ? { nullable: shape.nullable } : {}),
        ...(shape.title ? { title: shape.title } : {}),
        ...(shape.semantic ? { semantic: shape.semantic } : {}),
        ...(properties && Object.keys(properties).length > 0 ? { properties } : {}),
        ...(shape.required?.length ? { required: [...shape.required].sort() } : {}),
        ...(shape.items ? { items: normalizeShape(shape.items) } : {}),
    };
}

function compareEndpoints(
    left: DeclarativeConnectorFunctionHttpEndpointContract,
    right: DeclarativeConnectorFunctionHttpEndpointContract,
): number {
    return left.route.localeCompare(right.route) || left.method.localeCompare(right.method);
}
