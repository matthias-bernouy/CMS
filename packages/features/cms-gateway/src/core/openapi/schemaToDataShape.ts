import type { DataShape } from "../../interfaces/DataShape";
import type { JSONSchema } from "./types";

export function schemaToDataShape(schema: JSONSchema | null | undefined, depth = 0): DataShape | null {
    if (!schema || depth > 8) return null;
    const type = schemaType(schema);
    if (schema.allOf) {
        const own = type === "object" || (!type && schema.properties) ? objectShape(schema, depth) : null;
        return mergeAllOf(schema.allOf, depth, own);
    }
    if (!type && (schema.anyOf || schema.oneOf)) {
        const first = [...(schema.anyOf ?? []), ...(schema.oneOf ?? [])]
            .map(s => schemaToDataShape(s, depth + 1)).find(Boolean);
        return first ?? null;
    }
    if (type === "object" || (!type && schema.properties)) return objectShape(schema, depth);
    if (type === "array") return { type: "array", items: schemaToDataShape(schema.items, depth + 1) ?? { type: "string" } };
    return shapeFromType(type ?? "string");
}

export function shapeFromType(type: string): DataShape {
    if (type === "number" || type === "integer") return { type: "number" };
    if (type === "boolean") return { type: "boolean" };
    if (type === "object") return { type: "object" };
    if (type === "array") return { type: "array", items: { type: "string" } };
    return { type: "string" };
}

function objectShape(schema: JSONSchema, depth: number): DataShape {
    const properties: Record<string, DataShape> = {};
    for (const [key, child] of Object.entries(schema.properties ?? {})) {
        if (!key || key === "__proto__" || key === "constructor" || key === "prototype") continue;
        const shape = schemaToDataShape(child, depth + 1);
        if (shape) properties[key] = shape;
    }
    const shape: DataShape = { type: "object" };
    if (Object.keys(properties).length) shape.properties = properties;
    const required = (schema.required ?? []).filter(name => Object.hasOwn(properties, name));
    if (required.length) shape.required = [...new Set(required)];
    return shape;
}

function mergeAllOf(schemas: JSONSchema[], depth: number, own: DataShape | null): DataShape | null {
    const shapes = [own, ...schemas.map(s => schemaToDataShape(s, depth + 1))].filter(isDataShape);
    if (!shapes.length) return null;
    if (shapes.some(s => s.type !== "object")) return shapes[0] ?? null;
    const properties = Object.assign({}, ...shapes.map(s => s.properties ?? {}));
    const required = shapes.flatMap(s => s.required ?? []).filter(name => Object.hasOwn(properties, name));
    const shape: DataShape = { type: "object" };
    if (Object.keys(properties).length) shape.properties = properties;
    if (required.length) shape.required = [...new Set(required)];
    return shape;
}

function isDataShape(shape: DataShape | null): shape is DataShape {
    return shape !== null;
}

function schemaType(schema: JSONSchema): string | undefined {
    const raw = (schema as { type?: string | string[] }).type;
    return Array.isArray(raw) ? raw.find(t => t !== "null") : raw;
}
