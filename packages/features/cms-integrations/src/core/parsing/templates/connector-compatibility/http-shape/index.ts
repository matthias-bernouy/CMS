import { IntegrationInputError } from "../../../../errors";
import type { DeclarativeConnectorFunctionHttpDataShape } from "../../../../../interfaces/Integration";
import { assertOnlyKeys, record, requiredBoolean } from "../values";
import { parseObjectShape } from "./objects";
import { optionalNonNegativeInteger, parseBooleanShape, parseNumberShape, parseStringShape } from "./scalars";

const SHAPE_TYPES = new Set<DeclarativeConnectorFunctionHttpDataShape["type"]>([
    "string",
    "number",
    "boolean",
    "object",
    "array",
]);
const MAX_DEPTH = 10;
const MAX_NODES = 500;

type ShapeState = { nodes: number };

export function parseConnectorFunctionHttpDataShape(
    value: unknown,
    name: string,
): DeclarativeConnectorFunctionHttpDataShape {
    return parseShape(value, name, 0, { nodes: 0 });
}

function parseShape(
    value: unknown,
    name: string,
    depth: number,
    state: ShapeState,
): DeclarativeConnectorFunctionHttpDataShape {
    if (depth >= MAX_DEPTH) {
        throw new IntegrationInputError(name, `must not be nested more than ${MAX_DEPTH} levels`);
    }
    state.nodes += 1;
    if (state.nodes > MAX_NODES) {
        throw new IntegrationInputError(name, `must not contain more than ${MAX_NODES} shape nodes`);
    }
    const input = record(value, name);
    const type = parseShapeType(input.type, `${name}.type`);
    const common =
        input.nullable === undefined ? {} : { nullable: requiredBoolean(input.nullable, `${name}.nullable`) };
    if (type === "string") {
        return parseStringShape(input, common, name);
    }
    if (type === "number") {
        return parseNumberShape(input, common, name);
    }
    if (type === "boolean") {
        return parseBooleanShape(input, common, name);
    }
    if (type === "object") {
        return parseObjectShape(input, common, name, depth, state, parseShape);
    }
    return parseArrayShape(input, common, name, depth, state);
}

function parseArrayShape(
    input: Record<string, unknown>,
    common: Pick<DeclarativeConnectorFunctionHttpDataShape, "nullable">,
    name: string,
    depth: number,
    state: ShapeState,
): Extract<DeclarativeConnectorFunctionHttpDataShape, { type: "array" }> {
    assertOnlyKeys(input, ["type", "nullable", "items", "minItems", "maxItems"], name);
    const minItems = optionalNonNegativeInteger(input.minItems, `${name}.minItems`);
    const maxItems = optionalNonNegativeInteger(input.maxItems, `${name}.maxItems`);
    if (minItems !== undefined && maxItems !== undefined && minItems > maxItems) {
        throw new IntegrationInputError(`${name}.maxItems`, `must be greater than or equal to ${name}.minItems`);
    }
    return {
        type: "array",
        ...common,
        ...(input.items !== undefined ? { items: parseShape(input.items, `${name}.items`, depth + 1, state) } : {}),
        ...(minItems !== undefined ? { minItems } : {}),
        ...(maxItems !== undefined ? { maxItems } : {}),
    };
}

function parseShapeType(value: unknown, name: string): DeclarativeConnectorFunctionHttpDataShape["type"] {
    if (typeof value !== "string" || !SHAPE_TYPES.has(value as DeclarativeConnectorFunctionHttpDataShape["type"])) {
        throw new IntegrationInputError(name, `must be one of ${[...SHAPE_TYPES].join(", ")}`);
    }
    return value as DeclarativeConnectorFunctionHttpDataShape["type"];
}
