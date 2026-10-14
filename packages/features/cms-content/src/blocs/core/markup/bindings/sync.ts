import { CMS_SYNC_SCOPES, type CmsSyncScope, type CmsSyncTarget } from "cms-content/blocs/core/markup/bindings/types";

const SYNC_TARGET_PATTERN = /^@(param|page|session|persistent):([a-z][a-z0-9]*(?:[.-][a-z0-9]+)*)$/u;
const MAX_SYNC_KEY_LENGTH = 128;

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
