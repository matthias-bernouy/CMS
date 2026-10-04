export type BlobInput = Blob | Uint8Array | ReadableStream<Uint8Array>;
export type BlobRange = Readonly<{ start: number; end: number }>;
export type BlobReadOptions = Readonly<{ range?: BlobRange }>;
export type BlobMetadata = Readonly<{ size: number }>;

export interface BlobReader {
    get(key: string, options?: BlobReadOptions): Promise<ReadableStream<Uint8Array> | null>;
    head(key: string): Promise<BlobMetadata | null>;
}

export interface BlobWriter {
    put(key: string, data: BlobInput): Promise<BlobMetadata>;
}

export interface BlobDeleter {
    delete(key: string): Promise<void>;
}

export interface BlobStore extends BlobReader, BlobWriter, BlobDeleter {
    exists(key: string): Promise<boolean>;
}

export function assertBlobRange(range: BlobRange, size: number): void {
    if (
        !Number.isSafeInteger(range.start) ||
        !Number.isSafeInteger(range.end) ||
        range.start < 0 ||
        range.end < range.start ||
        range.end >= size
    ) {
        throw new RangeError("blob range must be within the stored representation");
    }
}

export function assertBlobKey(key: string): void {
    if (
        !key ||
        key.startsWith("/") ||
        key.includes("\\") ||
        key.split("/").some((part) => !part || part === "." || part === "..")
    ) {
        throw new TypeError(`invalid blob key "${key}"`);
    }
}
