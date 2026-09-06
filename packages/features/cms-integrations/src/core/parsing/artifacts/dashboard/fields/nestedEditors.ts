import { IntegrationInputError } from "../../../../errors";
import { optionalBoolean } from "../../common";
import { parseEmbeddedLookup, parseOptions } from "../refs";

export function parseNestedEditor(
    value: Record<string, unknown>,
    name: string,
    allowed: readonly string[],
): Record<string, unknown> {
    const explicitType = Object.hasOwn(value, "type");
    const type = explicitType ? value.type : "text";
    if (typeof type !== "string" || !allowed.includes(type)) {
        throw new IntegrationInputError(`${name}.type`, `must be ${allowed.join(", ")}`);
    }
    if (Object.hasOwn(value, "allowCustom")) {
        throw new IntegrationInputError(`${name}.allowCustom`, "is not supported for nested editors");
    }

    const hasOptions = Object.hasOwn(value, "options");
    const hasLookup = Object.hasOwn(value, "lookup");
    if (hasOptions && type !== "select" && type !== "combobox") {
        throw new IntegrationInputError(`${name}.options`, `is not supported for ${type} editors`);
    }
    if (hasLookup && type !== "combobox") {
        throw new IntegrationInputError(`${name}.lookup`, "is only supported for combobox editors");
    }
    const options = hasOptions ? parseOptions(value.options, `${name}.options`) : undefined;
    if (options?.length === 0) {
        throw new IntegrationInputError(`${name}.options`, "must not be empty");
    }
    if (type === "select" && !options) {
        throw new IntegrationInputError(`${name}.options`, "is required");
    }
    const lookup = hasLookup ? parseEmbeddedLookup(value.lookup, `${name}.lookup`) : undefined;
    if (type === "combobox" && !options && !lookup) {
        throw new IntegrationInputError(name, "must declare options or lookup");
    }
    return {
        ...(explicitType ? { type } : {}),
        ...(type === "page-link" ? parsePageLinkOptions(value, name) : {}),
        ...(options ? { options } : {}),
        ...(lookup ? { lookup } : {}),
    };
}

export function parsePageLinkOptions(
    value: Record<string, unknown>,
    name: string,
): { publishedOnly?: boolean; allowExternal?: boolean; allowMedia?: boolean } {
    const options: { publishedOnly?: boolean; allowExternal?: boolean; allowMedia?: boolean } = {};
    for (const key of ["publishedOnly", "allowExternal", "allowMedia"] as const) {
        const parsed = optionalBoolean(value[key], `${name}.${key}`);
        if (parsed !== undefined) {
            options[key] = parsed;
        }
    }
    return options;
}
