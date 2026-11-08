export interface ZipLimits {
    readonly maxArchiveBytes: number;
    readonly maxEntryBytes: number;
    readonly maxTotalBytes: number;
    readonly maxEntries: number;
    readonly maxPathBytes: number;
    readonly maxDepth: number;
}
export interface ZipOptions {
    readonly limits?: Partial<ZipLimits>;
    readonly signal?: AbortSignal;
}
export interface ZipSourceEntry {
    readonly path: string;
    readonly bytes: Blob | Uint8Array | string;
}
export interface ZipEntry {
    readonly path: string;
    readonly bytes: Blob;
}
export interface DecodedZip {
    readonly entries: readonly ZipEntry[];
    readonly archiveBytes: number;
    readonly totalBytes: number;
}
