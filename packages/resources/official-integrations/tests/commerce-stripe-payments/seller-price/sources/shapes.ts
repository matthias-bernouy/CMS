import type { DataShape } from "@bernouy/cms-sources";

export const openObject = { type: "object" } as const;

export const text = (nullable = false): DataShape => ({
    type: "string",
    ...(nullable ? { nullable: true } : {}),
});

export const number = (nullable = false): DataShape => ({
    type: "number",
    ...(nullable ? { nullable: true } : {}),
});

export const boolean = (): DataShape => ({ type: "boolean" });

export const strings = (): DataShape => ({
    type: "array",
    items: text(),
});

export function object(properties: Record<string, DataShape>, required?: string[]): DataShape {
    return {
        type: "object",
        properties,
        ...(required ? { required } : {}),
    };
}

export function computedHeader(name: string) {
    return {
        name,
        source: { from: "computed" as const, ref: "userID" as const },
    };
}

export function query(name: string) {
    return {
        name,
        in: "query" as const,
        required: false,
        schema: text(),
    };
}
