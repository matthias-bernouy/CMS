import type { UlviaSchema, UlviaResolvedSchema, UlviaSchemaReference } from "ulvia-contracts/interfaces/UlviaSchema";
function schemaChildren(schema: UlviaSchema): readonly UlviaSchema[] {
    switch (schema.type) {
        case "object":
            return Object.values(schema.properties);
        case "array":
            return [schema.items];
        case "map":
            return [schema.values];
        default:
            return [];
    }
}
export function containsResolvedSchema(schema: UlviaSchema): boolean {
    return schema.type === "resolved" || schemaChildren(schema).some(containsResolvedSchema);
}
export function resolvedSchemaNodes(
    schema: UlviaSchema,
    path = "",
): readonly { path: string; schema: UlviaResolvedSchema }[] {
    if (schema.type === "resolved") {
        return [{ path, schema }];
    }
    if (schema.type === "object") {
        return Object.entries(schema.properties).flatMap(([name, child]) =>
            resolvedSchemaNodes(child, `${path}/${name.replaceAll("~", "~0").replaceAll("/", "~1")}`),
        );
    }
    if (schema.type === "array") {
        return resolvedSchemaNodes(schema.items, `${path}/*`);
    }
    if (schema.type === "map") {
        return resolvedSchemaNodes(schema.values, `${path}/*`);
    }
    return [];
}
export function referenceValue(reference: UlviaSchemaReference, value: unknown, input?: unknown): unknown {
    let current = reference.source === "input" ? input : value;
    for (const segment of reference.path.slice(1).split("/")) {
        const key = segment.replaceAll("~1", "/").replaceAll("~0", "~");
        if (!current || typeof current !== "object" || !Object.hasOwn(current, key)) {
            throw new TypeError(`Schema selector reference is unavailable: ${reference.source}:${reference.path}`);
        }
        current = (current as Record<string, unknown>)[key];
    }
    return current;
}
