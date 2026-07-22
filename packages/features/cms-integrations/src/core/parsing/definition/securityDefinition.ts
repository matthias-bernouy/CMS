import { IntegrationInputError } from "../../errors";
import type { IntegrationSecurityDefinition } from "../../../interfaces/Integration";
import { isRecord, text } from "./values";

export function parseSecurityDefinition(value: unknown): IntegrationSecurityDefinition | undefined {
    if (value === undefined || value === null) {
        return undefined;
    }
    if (!isRecord(value)) {
        throw new IntegrationInputError("definition.security", "must be an object");
    }
    const csp = parseCspPolicy(value.csp, "definition.security.csp");
    return csp ? { csp } : undefined;
}

export function validateSecurityDefinition(security: IntegrationSecurityDefinition): void {
    if (security.csp === undefined) {
        return;
    }
    parseCspPolicy(security.csp, "definition.security.csp");
}

function parseCspPolicy(value: unknown, name: string): NonNullable<IntegrationSecurityDefinition["csp"]> | undefined {
    if (value === undefined || value === null) {
        return undefined;
    }
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    const out: NonNullable<IntegrationSecurityDefinition["csp"]> = {};
    for (const directive of ["connect", "media", "style", "script", "frame"] as const) {
        if (value[directive] !== undefined) {
            const sources = parseCspSourceList(value[directive], `${name}.${directive}`);
            if (sources.length) {
                out[directive] = sources;
            }
        }
    }
    return Object.keys(out).length ? out : undefined;
}

function parseCspSourceList(value: unknown, name: string): string[] {
    if (!Array.isArray(value)) {
        throw new IntegrationInputError(name, "must be an array");
    }
    return [...new Set(value.map((entry, index) => parseCspSource(entry, `${name}.${index}`)))];
}

function parseCspSource(value: unknown, name: string): string {
    const source = text(value);
    if (!source) {
        throw new IntegrationInputError(name, "must be a non-empty string");
    }
    try {
        return new URL(source).origin;
    } catch {
        throw new IntegrationInputError(name, "must be an absolute origin");
    }
}
