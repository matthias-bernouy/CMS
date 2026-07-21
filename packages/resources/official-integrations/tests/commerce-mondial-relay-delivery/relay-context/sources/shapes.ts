import type { DataShape } from "@bernouy/cms-sources";

export const text = (nullable = false): DataShape => ({
    type: "string",
    ...(nullable ? { nullable: true } : {}),
});

export const number = (nullable = false): DataShape => ({
    type: "number",
    ...(nullable ? { nullable: true } : {}),
});

export const boolean = (): DataShape => ({ type: "boolean" });

export const array = (items: DataShape): DataShape => ({
    type: "array",
    items,
});

export const object = (properties?: Record<string, DataShape>, nullable = false): DataShape => ({
    type: "object",
    ...(properties ? { properties } : {}),
    ...(nullable ? { nullable: true } : {}),
});

export const userId = (): DataShape => ({
    type: "string",
    semantic: { kind: "user-id", authority: "cms" },
});

export function computedUserHeader(name = "x-cms-user-id") {
    return [
        {
            name,
            source: { from: "computed" as const, ref: "userID" as const },
        },
    ];
}
