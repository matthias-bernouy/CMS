import type { SourceEndpointAccess, SourceEndpointAccessMode } from "@bernouy/cms-sources";
import { isSourceEndpointAccessMode } from "@bernouy/cms-sources";
import { IntegrationInputError, MissingIntegrationParam } from "../../errors";
import { isRecord, text } from "../values";

export function requiredText(value: unknown, name: string): string {
    const result = text(value);
    if (!result) throw new MissingIntegrationParam(name);
    return result;
}

export function optionalText(value: unknown, name: string): string | undefined {
    if (value === undefined) return undefined;
    const result = text(value);
    if (!result) throw new IntegrationInputError(name, "must be a non-empty string");
    return result;
}

export function optionalBoolean(value: unknown, name: string): boolean | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== "boolean") throw new IntegrationInputError(name, "must be boolean");
    return value;
}

export function optionalFiniteNumber(value: unknown, name: string): number | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new IntegrationInputError(name, "must be a finite number");
    }
    return value;
}

export function parseStringList(value: unknown, name: string): string[] {
    if (!Array.isArray(value)) throw new IntegrationInputError(name, "must be an array");
    return value.map((entry, index) => requiredText(entry, `${name}.${index}`));
}

export function parseStringMap(value: unknown, name: string): Record<string, string> {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    const out: Record<string, string> = {};
    for (const [key, entry] of Object.entries(value)) {
        out[key] = requiredText(entry, `${name}.${key}`);
    }
    return out;
}

export function parseStringRecord(value: unknown, name: string): Record<string, string> {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => {
        const parsed = text(entry);
        if (!parsed) throw new IntegrationInputError(`${name}.${key}`, "must be a non-empty string");
        return [key, parsed];
    }));
}

export function parseAccessTemplate(value: unknown, name: string): SourceEndpointAccess {
    const mode = typeof value === "string"
        ? value
        : isRecord(value)
            ? text(value.mode)
            : undefined;
    if (!isSourceEndpointAccessMode(mode)) {
        throw new IntegrationInputError(name, "must be public, auth, admin, or system");
    }
    return { mode: mode as SourceEndpointAccessMode };
}
