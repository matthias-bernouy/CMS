export interface ImageDecodeOptions {
    readonly maxInputPixels?: number;
    readonly timeoutMs?: number;
    /** Treat decoder warnings as failures. */
    readonly strict?: boolean;
}

export interface ImageTransformOptions extends ImageDecodeOptions {
    readonly width: number;
    readonly quality: number;
    readonly autoOrient?: boolean;
    readonly colourspace?: "srgb";
}

export interface ImageMetadata {
    readonly format: string;
    readonly width: number;
    readonly height: number;
    readonly pages: number;
}

export interface ImageTransformResult {
    readonly bytes: Uint8Array;
    readonly width: number;
    readonly height: number;
}

export interface ImageTransformer {
    readonly encoderIdentity: string;
    inspect(source: Uint8Array, options?: ImageDecodeOptions): Promise<ImageMetadata>;
    transform(source: Uint8Array, options: ImageTransformOptions): Promise<ImageTransformResult>;
}
