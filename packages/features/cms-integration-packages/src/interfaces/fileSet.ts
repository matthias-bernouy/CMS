export type CanonicalFileEncoding = "utf8" | "base64";

export interface CanonicalFile {
    encoding: CanonicalFileEncoding;
    content: string;
}

export type CanonicalFileSet = Record<string, CanonicalFile>;

export interface CanonicalFileSetLimits {
    maxDepth: number;
    maxDirectories: number;
    maxFiles: number;
    maxFileBytes: number;
    maxDecodedBytes: number;
    maxDocumentBytes: number;
    maxPathBytes: number;
    maxSegmentBytes: number;
}

export interface CanonicalFileSetValidationOptions {
    limits?: Partial<CanonicalFileSetLimits>;
}
