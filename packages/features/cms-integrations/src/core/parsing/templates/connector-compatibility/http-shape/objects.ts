import { IntegrationInputError } from "../../../../errors";
import type { DeclarativeConnectorFunctionHttpDataShape } from "../../../../../interfaces/Integration";
import { assertOnlyKeys, record } from "../values";

const MAX_PROPERTIES = 256;
const MAX_PROPERTY_NAME_LENGTH = 256;

type ShapeState = { nodes: number };
type ParseNestedShape = (
    value: unknown,
    name: string,
    depth: number,
    state: ShapeState,
) => DeclarativeConnectorFunctionHttpDataShape;

export function parseObjectShape(
    input: Record<string, unknown>,
    common: Pick<DeclarativeConnectorFunctionHttpDataShape, "nullable">,
    name: string,
    depth: number,
    state: ShapeState,
    parseShape: ParseNestedShape,
): Extract<DeclarativeConnectorFunctionHttpDataShape, { type: "object" }> {
    assertOnlyKeys(input, ["type", "nullable", "properties", "required"], name);
    const properties = parseProperties(input.properties, `${name}.properties`, depth, state, parseShape);
    const required = parseRequiredProperties(input.required, properties, `${name}.required`);
    return {
        type: "object",
        ...common,
        ...(Object.keys(properties).length > 0 ? { properties } : {}),
        ...(required.length > 0 ? { required } : {}),
    };
}

function parseProperties(
    value: unknown,
    name: string,
    depth: number,
    state: ShapeState,
    parseShape: ParseNestedShape,
): Record<string, DeclarativeConnectorFunctionHttpDataShape> {
    if (value === undefined) {
        return {};
    }
    const input = record(value, name);
    const entries = Object.entries(input);
    if (entries.length > MAX_PROPERTIES) {
        throw new IntegrationInputError(name, `must not contain more than ${MAX_PROPERTIES} properties`);
    }
    const properties: Record<string, DeclarativeConnectorFunctionHttpDataShape> = {};
    for (const [propertyName, propertyShape] of entries.sort(([left], [right]) => compareText(left, right))) {
        validatePropertyName(propertyName, name);
        properties[propertyName] = parseShape(propertyShape, `${name}.${propertyName}`, depth + 1, state);
    }
    return properties;
}

function parseRequiredProperties(
    value: unknown,
    properties: Record<string, DeclarativeConnectorFunctionHttpDataShape>,
    name: string,
): string[] {
    if (value === undefined) {
        return [];
    }
    if (!Array.isArray(value)) {
        throw new IntegrationInputError(name, "must be an array");
    }
    if (value.length > MAX_PROPERTIES) {
        throw new IntegrationInputError(name, `must not contain more than ${MAX_PROPERTIES} properties`);
    }
    const required = value.map((entry, index) => parsePropertyName(entry, `${name}.${index}`));
    const seen = new Set<string>();
    for (const propertyName of required) {
        if (seen.has(propertyName)) {
            throw new IntegrationInputError(name, `contains duplicate property "${propertyName}"`);
        }
        if (!Object.hasOwn(properties, propertyName)) {
            throw new IntegrationInputError(name, `references undeclared property "${propertyName}"`);
        }
        seen.add(propertyName);
    }
    return required.sort(compareText);
}

function parsePropertyName(value: unknown, name: string): string {
    if (typeof value !== "string") {
        throw new IntegrationInputError(name, "must be a string");
    }
    validatePropertyName(value, name);
    return value;
}

function validatePropertyName(value: string, name: string): void {
    if (value.length === 0) {
        throw new IntegrationInputError(name, "property names must not be empty");
    }
    if (value.length > MAX_PROPERTY_NAME_LENGTH) {
        throw new IntegrationInputError(name, `property names must not exceed ${MAX_PROPERTY_NAME_LENGTH} characters`);
    }
    if (value.includes("\0")) {
        throw new IntegrationInputError(name, "property names must not contain NUL characters");
    }
    if (value === "__proto__" || value === "constructor" || value === "prototype") {
        throw new IntegrationInputError(name, `unsafe property name "${value}"`);
    }
}

function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}
