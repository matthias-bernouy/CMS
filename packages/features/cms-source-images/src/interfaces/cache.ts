export type SourceImageDerivative = Readonly<{
    bytes: Uint8Array;
    etag: string;
    contentType: "image/webp";
    width: number;
    height: number;
    createdAt: number;
}>;

export type SourceImageLookup = Readonly<{
    derivativeKey: string;
    freshUntil: number;
    createdAt: number;
}>;

export type SourceImageCacheWrite = Readonly<{ evicted: number }>;

/** Derivative bytes and the short-lived public request index are separate so
 * private requests can reuse bytes only after their upstream authorization. */
export interface SourceImageCache {
    getDerivative(key: string): Promise<SourceImageDerivative | null>;
    putDerivative(key: string, derivative: SourceImageDerivative): Promise<SourceImageCacheWrite>;
    deleteDerivative(key: string): Promise<void>;
    getLookup(key: string): Promise<SourceImageLookup | null>;
    putLookup(key: string, lookup: SourceImageLookup): Promise<void>;
    deleteLookup(key: string): Promise<void>;
}
