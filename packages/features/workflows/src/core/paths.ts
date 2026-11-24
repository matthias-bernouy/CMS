import type { UlviaSchema } from "@bernouy/ulvia-contracts/schema";
import { workflowIssue } from "./errors";
function pointerParts(pointer: string): readonly string[] {
    if (!pointer) {
        return [];
    }
    if (!pointer.startsWith("/") || /~(?:[^01]|$)/u.test(pointer)) {
        workflowIssue("path");
    }
    return pointer
        .slice(1)
        .split("/")
        .map((part) => part.replace(/~1/gu, "/").replace(/~0/gu, "~"));
}
export function schemaAt(
    schema: UlviaSchema,
    pointer: string,
    facts?: ReadonlySet<string>,
    root = "",
    inspect = false,
): UlviaSchema {
    let prefix = "";
    for (const part of pointerParts(pointer)) {
        prefix += `/${part.replace(/~/gu, "~0").replace(/\//gu, "~1")}`;
        if ("nullable" in schema && schema.nullable && !inspect && !facts?.has(`${root}:${prefix}`)) {
            workflowIssue(`path.nullable:${pointer}`);
        }
        if (schema.type === "object") {
            if (
                !Object.hasOwn(schema.properties, part) ||
                (!inspect && !schema.required.includes(part) && !facts?.has(`${root}:${prefix}`))
            ) {
                workflowIssue(`path.unavailable:${pointer}`);
            }
            schema = schema.properties[part]!;
        } else if (
            schema.type === "array" &&
            /^(0|[1-9][0-9]*)$/u.test(part) &&
            (inspect || Number(part) < (schema.minItems ?? 0) || facts?.has(`${root}:${prefix}`))
        ) {
            schema = schema.items;
        } else if (schema.type === "map" && (inspect || facts?.has(`${root}:${prefix}`))) {
            schema = schema.values;
        } else {
            workflowIssue(`path.unavailable:${pointer}`);
        }
    }
    return schema;
}
export function valueAt(value: unknown, pointer: string): unknown {
    for (const part of pointerParts(pointer)) {
        if (!value || typeof value !== "object" || !Object.hasOwn(value, part)) {
            workflowIssue(`path.unavailable:${pointer}`);
        }
        value = (value as Record<string, unknown>)[part];
    }
    return value;
}
