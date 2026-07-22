import { coercePageRef, type TPageRef, type TSystem } from "@bernouy/cms-content";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";

export function parseOriginList(raw: unknown, paramName: string): string[] {
    if (raw === undefined || raw === null || raw === "") {
        return [];
    }
    if (typeof raw !== "string") {
        throw new InvalidParam(paramName, "expected a string.");
    }
    return raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
}

export function asString(raw: unknown, paramName: string): string {
    if (raw === undefined || raw === null) {
        return "";
    }
    if (typeof raw !== "string") {
        throw new InvalidParam(paramName, "expected a string.");
    }
    return raw;
}

export function asBoolean(raw: unknown, paramName: string): boolean {
    if (Array.isArray(raw)) {
        return raw.length ? asBoolean(raw[raw.length - 1], paramName) : false;
    }
    if (typeof raw === "boolean") {
        return raw;
    }
    if (raw === undefined || raw === null || raw === "") {
        return false;
    }
    if (typeof raw !== "string") {
        throw new InvalidParam(paramName, "expected a boolean.");
    }
    const value = raw.trim().toLowerCase();
    if (["1", "true", "on", "yes"].includes(value)) {
        return true;
    }
    if (["0", "false", "off", "no"].includes(value)) {
        return false;
    }
    throw new InvalidParam(paramName, "expected a boolean.");
}

export function asInteger(raw: unknown, paramName: string): number {
    if (typeof raw === "number" && Number.isInteger(raw)) {
        return raw;
    }
    if (typeof raw !== "string") {
        throw new InvalidParam(paramName, "expected an integer.");
    }
    const value = Number(raw);
    if (!Number.isInteger(value)) {
        throw new InvalidParam(paramName, "expected an integer.");
    }
    return value;
}

export function parseEmailTemplate(
    body: Record<string, unknown>,
    email: TSystem["email"],
    key: keyof TSystem["email"]["templates"],
): void {
    const prefix = `email.templates.${key}`;
    if (`${prefix}.subject` in body) {
        email.templates[key].subject = asString(body[`${prefix}.subject`], `${prefix}.subject`);
    }
    if (`${prefix}.html` in body) {
        email.templates[key].html = asString(body[`${prefix}.html`], `${prefix}.html`);
    }
}

export function hasSectionKey(body: Record<string, unknown>, prefix: string): boolean {
    const head = `${prefix}.`;
    return Object.keys(body).some((key) => key.startsWith(head));
}

export function collectStringSection(
    body: Record<string, unknown>,
    prefix: string,
    excludeLeaves: string[],
): Record<string, string> {
    const out: Record<string, string> = {};
    const head = `${prefix}.`;
    const exclude = new Set(excludeLeaves);
    for (const [key, value] of Object.entries(body)) {
        if (!key.startsWith(head)) {
            continue;
        }
        const leaf = key.slice(head.length);
        if (exclude.has(leaf)) {
            continue;
        }
        if (typeof value !== "string") {
            throw new InvalidParam(key, "expected a string.");
        }
        out[leaf] = value;
    }
    return out;
}

export function asPageRef(raw: unknown): TPageRef {
    if (raw !== undefined && raw !== null && raw !== "" && typeof raw !== "string") {
        throw new InvalidParam("page reference", "expected a string.");
    }
    return coercePageRef(raw);
}
