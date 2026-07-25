export const SOURCE_IMAGE_WIDTHS = Object.freeze([64, 128, 256, 384, 512, 768, 1024, 1280, 1600, 1920, 2560] as const);

export type SourceImageWidth = (typeof SOURCE_IMAGE_WIDTHS)[number];

export type SourceImageRecipe = Readonly<{
    id: string;
    widths: readonly SourceImageWidth[];
    format: "webp";
    quality: number;
    maxSourceBytes: number;
    maxInputPixels: number;
    processingTimeoutMs: number;
    animatedInput: "reject";
}>;
