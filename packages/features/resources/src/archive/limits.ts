import { DEFAULT_ZIP_LIMITS } from "@bernouy/zip";
import type { ZipOptions, ZipLimits } from "@bernouy/zip";

/** Callers may lower import budgets, never enlarge the format ceiling. */
export function resourceZipOptions(options: ZipOptions): { signal?: AbortSignal; limits: ZipLimits } {
    const bound = (key: keyof ZipLimits): number => {
        const maximum = DEFAULT_ZIP_LIMITS[key];
        const requested = options.limits?.[key] ?? maximum;
        if (!Number.isSafeInteger(requested) || requested < 1) {
            throw new TypeError("Resource ZIP limits must be positive safe integers");
        }
        return Math.min(requested, maximum);
    };
    return {
        signal: options.signal,
        limits: {
            maxArchiveBytes: bound("maxArchiveBytes"),
            maxEntryBytes: bound("maxEntryBytes"),
            maxTotalBytes: bound("maxTotalBytes"),
            maxEntries: bound("maxEntries"),
            maxPathBytes: bound("maxPathBytes"),
            maxDepth: bound("maxDepth"),
        },
    };
}
