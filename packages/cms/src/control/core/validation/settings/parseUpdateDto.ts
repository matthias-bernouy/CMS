import InvalidParam from "src/control/errors/Http/InvalidParam";
import type { TPageRef, TSystem } from "src/socle/interfaces/models";

export type SettingsUpdateDto = Partial<TSystem>;

/**
 * Validates a flat dotted body (as emitted by `<cms-form>`) against the
 * settings-update contract and produces a nested `Partial<TSystem>`.
 * `site.notFound` / `site.serverError` are coerced from `string` to
 * `TPageRef` (`""` → `null`, `"/path"` → `{ path }`).
 */
export function parseSettingsUpdateDto(body: Record<string, unknown>): SettingsUpdateDto {
    const dto: SettingsUpdateDto = {};

    if (hasSectionKey(body, "site")) {
        dto.site = {
            ...collectStringSection(body, "site", ["notFound", "serverError"]),
            notFound:    asPageRef(body["site.notFound"]),
            serverError: asPageRef(body["site.serverError"]),
        } as TSystem["site"];
    }

    if (hasSectionKey(body, "editor")) {
        dto.editor = collectStringSection(body, "editor", []) as TSystem["editor"];
    }

    return dto;
}

function hasSectionKey(body: Record<string, unknown>, prefix: string): boolean {
    const head = `${prefix}.`;
    for (const key of Object.keys(body)) {
        if (key.startsWith(head)) return true;
    }
    return false;
}

function collectStringSection(
    body: Record<string, unknown>,
    prefix: string,
    excludeLeaves: string[],
): Record<string, string> {
    const out: Record<string, string> = {};
    const head = `${prefix}.`;
    const exclude = new Set(excludeLeaves);
    for (const [key, value] of Object.entries(body)) {
        if (!key.startsWith(head)) continue;
        const leaf = key.slice(head.length);
        if (exclude.has(leaf)) continue;
        if (typeof value !== "string") {
            throw new InvalidParam(key, "expected a string.");
        }
        out[leaf] = value;
    }
    return out;
}

function asPageRef(raw: unknown): TPageRef {
    if (raw === undefined || raw === null || raw === "") return null;
    if (typeof raw !== "string") throw new InvalidParam("page reference", "expected a string.");
    return { path: raw };
}
