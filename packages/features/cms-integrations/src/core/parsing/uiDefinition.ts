import { IntegrationInputError } from "../errors";
import type { IntegrationUiDefinition } from "../../interfaces/Integration";

type UiReadMode = "throw" | "drop";

export function parseUiDefinition(value: unknown, name = "definition.ui"): IntegrationUiDefinition | undefined {
    return readUiDefinition(value, name, "throw");
}

export function sanitizeUiDefinition(value: unknown): IntegrationUiDefinition | undefined {
    return readUiDefinition(value, "ui", "drop");
}

function readUiDefinition(value: unknown, name: string, mode: UiReadMode): IntegrationUiDefinition | undefined {
    if (value === undefined || value === null) {
        return undefined;
    }
    if (!isRecord(value)) {
        return invalid(mode, name, "must be an object");
    }

    return {
        ...(text(value.mark) ? { mark: text(value.mark)! } : {}),
        ...(text(value.markClass) ? { markClass: text(value.markClass)! } : {}),
        ...(text(value.emit) ? { emit: text(value.emit)! } : {}),
        ...readPairField(value.instructions, `${name}.instructions`, "instructions", mode),
        ...readStringField(value.scopes, `${name}.scopes`, "scopes", mode),
        ...readStringField(value.checks, `${name}.checks`, "checks", mode),
        ...readPairField(value.resources, `${name}.resources`, "resources", mode),
        ...readStringField(value.review, `${name}.review`, "review", mode),
        ...readStringField(value.sync, `${name}.sync`, "sync", mode),
        ...(text(value.syncNote) ? { syncNote: text(value.syncNote)! } : {}),
    };
}

function readStringField<K extends keyof IntegrationUiDefinition>(
    value: unknown,
    name: string,
    key: K,
    mode: UiReadMode,
): Pick<IntegrationUiDefinition, K> | {} {
    if (value === undefined) {
        return {};
    }
    const list = stringList(value, name, mode);
    return list ? ({ [key]: list } as Pick<IntegrationUiDefinition, K>) : {};
}

function readPairField<K extends keyof IntegrationUiDefinition>(
    value: unknown,
    name: string,
    key: K,
    mode: UiReadMode,
): Pick<IntegrationUiDefinition, K> | {} {
    if (value === undefined) {
        return {};
    }
    const list = pairList(value, name, mode);
    return list ? ({ [key]: list } as Pick<IntegrationUiDefinition, K>) : {};
}

function stringList(value: unknown, name: string, mode: UiReadMode): string[] | undefined {
    if (!Array.isArray(value)) {
        return invalid(mode, name, "must be an array");
    }
    const out: string[] = [];
    for (const [index, entry] of value.entries()) {
        const item = text(entry);
        if (!item) {
            return invalid(mode, `${name}.${index}`, "must be a non-empty string");
        }
        out.push(item);
    }
    return out;
}

function pairList(value: unknown, name: string, mode: UiReadMode): Array<[string, string]> | undefined {
    if (!Array.isArray(value)) {
        return invalid(mode, name, "must be an array");
    }
    const out: Array<[string, string]> = [];
    for (const [index, entry] of value.entries()) {
        if (!Array.isArray(entry) || entry.length !== 2) {
            return invalid(mode, `${name}.${index}`, "must be a string pair");
        }
        const first = text(entry[0]);
        const second = text(entry[1]);
        if (!first || !second) {
            return invalid(mode, `${name}.${index}`, "must contain two non-empty strings");
        }
        out.push([first, second]);
    }
    return out;
}

function invalid(mode: UiReadMode, name: string, message: string): undefined {
    if (mode === "throw") {
        throw new IntegrationInputError(name, message);
    }
    return undefined;
}

function text(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
