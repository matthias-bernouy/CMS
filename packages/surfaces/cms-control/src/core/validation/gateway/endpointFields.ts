import {
    MAX_SOURCE_ENDPOINT_TIMEOUT_MS,
    isSourceEndpointAccessMode,
    type SourceEndpointAccess,
    type SourceEndpointEffects,
} from "@bernouy/cms-sources";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import MissingParam from "cms-control/core/admin/http/errors/MissingParam";

export function parseTimeoutMs(raw: string | undefined, name: string): number | undefined {
    if (raw === undefined || raw === "") {
        return undefined;
    }
    if (!/^\d+$/.test(raw)) {
        throw new InvalidParam(name, `must be an integer between 1 and ${MAX_SOURCE_ENDPOINT_TIMEOUT_MS}`);
    }
    const timeoutMs = Number(raw);
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_SOURCE_ENDPOINT_TIMEOUT_MS) {
        throw new InvalidParam(name, `must be an integer between 1 and ${MAX_SOURCE_ENDPOINT_TIMEOUT_MS}`);
    }
    return timeoutMs;
}

export function required(value: string | undefined, name: string): string {
    if (!value) {
        throw new MissingParam(name);
    }
    return value;
}

export function parseAccessBlob(raw: unknown, name: string): SourceEndpointAccess | undefined {
    const value = parseObjectBlob(raw, name);
    if (!value) {
        return undefined;
    }
    if (!isSourceEndpointAccessMode(value.mode)) {
        throw new InvalidParam(`${name}.mode`, "must be public|auth|admin|system.");
    }
    if (value.roles !== undefined) {
        throw new InvalidParam(`${name}.roles`, "is no longer supported; use admin access.");
    }
    return { mode: value.mode };
}

export function parseEffectsBlob(raw: unknown, name: string): SourceEndpointEffects | undefined {
    const value = parseObjectBlob(raw, name);
    if (!value) {
        return undefined;
    }
    const invalidatesSchema = value.invalidatesSchema;
    if (invalidatesSchema === undefined) {
        return undefined;
    }
    if (invalidatesSchema !== true) {
        throw new InvalidParam(`${name}.invalidatesSchema`, "must be true.");
    }
    return { invalidatesSchema: true };
}

function parseObjectBlob(raw: unknown, name: string): Record<string, unknown> | undefined {
    if (raw === undefined || raw === "") {
        return undefined;
    }
    if (typeof raw !== "string") {
        throw new InvalidParam(name, "expected a JSON string.");
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new InvalidParam(name, "must be valid JSON.");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new InvalidParam(name, "must be an object.");
    }
    return parsed as Record<string, unknown>;
}
