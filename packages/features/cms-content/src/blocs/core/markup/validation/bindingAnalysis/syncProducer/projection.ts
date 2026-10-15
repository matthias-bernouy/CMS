import { ContentValidationError } from "cms-content/application/core/validation/errors";
import type { BindingValueSchema } from "../types";

export function projectSchema(root: BindingValueSchema, paths: readonly (readonly string[])[]): BindingValueSchema {
    if (root.type !== "object") {
        throw issue("CMS synchronized producer must expose an object");
    }
    const properties: Record<string, BindingValueSchema> = {};
    const required = new Set<string>();
    for (const path of paths) {
        const [head, ...tail] = path;
        const property = root.properties[head!];
        if (!property) {
            throw issue(`CMS sync selection references unknown producer field ${JSON.stringify(head)}`);
        }
        properties[head!] = mergeProjected(properties[head!], projectBranch(property, tail, head!));
        if (root.required.includes(head!)) {
            required.add(head!);
        }
    }
    return { type: "object", properties, required: [...required] };
}

function projectBranch(schema: BindingValueSchema, path: readonly string[], displayPath: string): BindingValueSchema {
    if (path.length === 0) {
        return schema;
    }
    const [head, ...tail] = path;
    if (schema.type === "object") {
        const property = schema.properties[head!];
        if (!property) {
            throw issue(
                `CMS sync selection references unknown producer field ${JSON.stringify(`${displayPath}.${head}`)}`,
            );
        }
        return {
            type: "object",
            ...(schema.nullable ? { nullable: true } : {}),
            properties: { [head!]: projectBranch(property, tail, `${displayPath}.${head}`) },
            required: schema.required.includes(head!) ? [head!] : [],
        };
    }
    if (schema.type === "map") {
        return {
            type: "object",
            ...(schema.nullable ? { nullable: true } : {}),
            properties: { [head!]: projectBranch(schema.values, tail, `${displayPath}.${head}`) },
            required: [],
        };
    }
    throw issue(`CMS sync selection ${JSON.stringify(displayPath)} cannot traverse ${schema.type}`);
}

function mergeProjected(current: BindingValueSchema | undefined, next: BindingValueSchema): BindingValueSchema {
    if (!current) {
        return next;
    }
    if (current.type !== "object" || next.type !== "object") {
        throw issue("CMS sync selections overlap ambiguously");
    }
    return {
        type: "object",
        ...(current.nullable || next.nullable ? { nullable: true } : {}),
        properties: { ...current.properties, ...next.properties },
        required: [...new Set([...current.required, ...next.required])],
    };
}

function issue(message: string): ContentValidationError {
    return new ContentValidationError("content", message);
}
