import {
    CMS_SYNC_SCOPES,
    type CmsSyncScope,
    type CmsSyncSelection,
    type CmsSyncTarget,
} from "cms-content/blocs/core/markup/bindings/types";

const SYNC_TARGET_PATTERN = /^@(param|page|session|persistent):([a-z][a-z0-9]*(?:[.-][a-z0-9]+)*)$/u;
const MAX_SYNC_KEY_LENGTH = 128;
const MAX_SYNC_SELECTIONS = 16;
const MAX_SYNC_SELECTION_DEPTH = 24;
const SYNC_SELECTION_SEGMENT = /^[A-Za-z_$][\w$-]*$/u;
const FORBIDDEN_SELECTION_SEGMENTS = new Set(["__proto__", "constructor", "prototype"]);

export function asSyncTarget(target: CmsSyncTarget): string {
    const value = `@${target.scope}:${target.key.trim()}`;
    if (!parseSyncTarget(value)) {
        throw new TypeError("Invalid CMS sync target");
    }
    return value;
}

export function parseSyncTarget(value: string | null | undefined): CmsSyncTarget | null {
    const normalized = value?.trim() ?? "";
    if (normalized.length > MAX_SYNC_KEY_LENGTH + 12) {
        return null;
    }
    const match = SYNC_TARGET_PATTERN.exec(normalized);
    if (!match || match[2]!.length > MAX_SYNC_KEY_LENGTH) {
        return null;
    }
    return { scope: match[1] as CmsSyncScope, key: match[2]! };
}

export function isCmsSyncScope(value: string): value is CmsSyncScope {
    return (CMS_SYNC_SCOPES as readonly string[]).includes(value);
}

export function parseSyncSelection(value: string | null | undefined): CmsSyncSelection | null {
    const tokens = value?.trim().split(/\s+/u).filter(Boolean) ?? [];
    if (tokens.length === 0 || tokens.length > MAX_SYNC_SELECTIONS || new Set(tokens).size !== tokens.length) {
        return null;
    }
    const paths = tokens.map((token) => token.split("."));
    if (
        paths.some(
            (path) =>
                path.length > MAX_SYNC_SELECTION_DEPTH ||
                path.some(
                    (segment) => !SYNC_SELECTION_SEGMENT.test(segment) || FORBIDDEN_SELECTION_SEGMENTS.has(segment),
                ),
        ) ||
        paths.some((path, index) => paths.some((other, otherIndex) => index !== otherIndex && isPrefix(path, other)))
    ) {
        return null;
    }
    return paths;
}

function isPrefix(candidate: readonly string[], value: readonly string[]): boolean {
    return candidate.length < value.length && candidate.every((segment, index) => value[index] === segment);
}
