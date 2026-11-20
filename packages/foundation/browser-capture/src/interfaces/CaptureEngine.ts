export interface CaptureOptions {
    readonly width: number;
    readonly height: number;
    readonly mode: "viewport" | "full-page" | "element";
    readonly selector?: string;
    readonly themeMode: "light" | "dark";
}
export interface CaptureDocument {
    readonly origin?: string;
    /** URL-relative entry; file keys use decoded pathnames and unchanged query strings. */
    readonly path: string;
    readonly files: ReadonlyMap<string, Blob>;
}
export interface CaptureResult {
    readonly bytes: Uint8Array;
    readonly width: number;
    readonly height: number;
    readonly browserVersion: string;
    readonly diagnostics: readonly string[];
}
export interface CaptureEngine {
    capture(document: CaptureDocument, options: CaptureOptions, signal?: AbortSignal): Promise<CaptureResult>;
}
