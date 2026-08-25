import type { CmsRepeatBinding, CmsRepeatRangeBinding } from "./types";

export const CMS_REPEAT_RANGE_MAX = 100;

const REPEAT_ALIAS_PATTERN = /^\s*(.+?)\s+as\s+([A-Za-z_$][\w$]*)\s*$/;
const REPEAT_RANGE_PATTERN = /^\$range\((0|[1-9]\d*)\)$/;
const REPEAT_ALIAS_NAME_PATTERN = /^[A-Za-z_$][\w$]*$/;

export function asRepeat(binding: CmsRepeatBinding): string {
    const path = binding.path.trim();
    const alias = binding.alias?.trim();
    return alias ? `${path} as ${alias}` : path;
}

export function parseRepeat(value: string): CmsRepeatBinding | null {
    const match = REPEAT_ALIAS_PATTERN.exec(value);
    if (match) {
        return { path: match[1]!.trim(), alias: match[2]! };
    }
    const path = value.trim();
    return path ? { path } : null;
}

export function asRepeatRange(binding: CmsRepeatRangeBinding): string {
    if (!isCmsRepeatRangeCount(binding.count)) {
        throw new RangeError(`Repeat range count must be an integer from 0 to ${CMS_REPEAT_RANGE_MAX}.`);
    }
    const alias = binding.alias.trim();
    if (!REPEAT_ALIAS_NAME_PATTERN.test(alias)) {
        throw new TypeError("Repeat range alias must be a valid identifier.");
    }
    return asRepeat({ path: `$range(${binding.count})`, alias });
}

export function parseRepeatRange(value: string): CmsRepeatRangeBinding | null {
    const repeat = parseRepeat(value);
    if (!repeat?.alias) {
        return null;
    }
    const match = REPEAT_RANGE_PATTERN.exec(repeat.path);
    const count = match ? Number(match[1]) : Number.NaN;
    return isCmsRepeatRangeCount(count) ? { count, alias: repeat.alias } : null;
}

export function isCmsRepeatRangeCount(count: number): boolean {
    return Number.isInteger(count) && count >= 0 && count <= CMS_REPEAT_RANGE_MAX;
}
