import type { ZipLimits } from "zip/interfaces/zip";
export const DEFAULT_ZIP_LIMITS: Readonly<ZipLimits> = Object.freeze({
    maxArchiveBytes: 64 * 1024 * 1024,
    maxEntryBytes: 16 * 1024 * 1024,
    maxTotalBytes: 64 * 1024 * 1024,
    maxEntries: 2048,
    maxPathBytes: 1024,
    maxDepth: 32,
});
export function zipLimits(input?: Partial<ZipLimits>): Readonly<ZipLimits> {
    const limits = { ...DEFAULT_ZIP_LIMITS, ...input };
    for (const value of Object.values(limits)) {
        if (!Number.isSafeInteger(value) || value < 1) {
            throw new TypeError("ZIP limits must be positive safe integers");
        }
    }
    return Object.freeze(limits);
}
