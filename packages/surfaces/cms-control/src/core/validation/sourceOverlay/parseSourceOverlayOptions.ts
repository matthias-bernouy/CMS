import type { SourceOverlayDashboardOption } from "@bernouy/cms-sources";
import InvalidParam from "cms-control/errors/Http/InvalidParam";
import MissingParam from "cms-control/errors/Http/MissingParam";

export function parseSourceOverlayOptions(value: unknown, name: string): SourceOverlayDashboardOption[] {
    if (!Array.isArray(value)) throw new InvalidParam(name, "must be an array.");
    return value.map((entry, index) => {
        if (!isRecord(entry)) throw new InvalidParam(`${name}.${index}`, "must be an object.");
        return {
            value: requiredText(entry.value, `${name}.${index}.value`),
            label: requiredText(entry.label, `${name}.${index}.label`),
            ...(entry.subtitle !== undefined ? { subtitle: requiredText(entry.subtitle, `${name}.${index}.subtitle`) } : {}),
            ...(entry.media !== undefined ? { media: requiredText(entry.media, `${name}.${index}.media`) } : {}),
        };
    });
}

function requiredText(value: unknown, name: string): string {
    if (typeof value !== "string" || !value.trim()) throw new MissingParam(name);
    return value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
