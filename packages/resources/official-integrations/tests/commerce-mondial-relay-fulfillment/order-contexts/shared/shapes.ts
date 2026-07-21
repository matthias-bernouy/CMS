import type { DataShape } from "@bernouy/cms-sources";

export const text = (nullable = false): DataShape => ({
    type: "string",
    ...(nullable ? { nullable: true } : {}),
});

export const number = (): DataShape => ({ type: "number" });

export const boolean = (): DataShape => ({ type: "boolean" });

export const array = (items: DataShape): DataShape => ({
    type: "array",
    items,
});

export const object = (properties?: Record<string, DataShape>, required?: string[]): DataShape => ({
    type: "object",
    ...(properties ? { properties } : {}),
    ...(required ? { required } : {}),
});

export function computedUserHeader() {
    return [
        {
            name: "x-cms-user-id",
            source: { from: "computed" as const, ref: "userID" as const },
        },
    ];
}
