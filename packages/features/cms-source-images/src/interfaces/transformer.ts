import type { SourceImageRecipe } from "./recipe";

export const SOURCE_IMAGE_INPUT_FORMATS = ["jpeg", "png", "webp", "gif", "avif"] as const;
export type SourceImageInputFormat = (typeof SOURCE_IMAGE_INPUT_FORMATS)[number];

export type SourceImageMetadata = Readonly<{
    format: SourceImageInputFormat;
    width: number;
    height: number;
    pages: number;
}>;

export type SourceImageTransformResult = Readonly<{
    bytes: Uint8Array;
    width: number;
    height: number;
}>;

export interface SourceImageTransformer {
    /** Changes whenever the encoder can produce different bytes for one recipe. */
    readonly encoderIdentity: string;
    inspect(source: Uint8Array, recipe: SourceImageRecipe): Promise<SourceImageMetadata>;
    transform(
        source: Uint8Array,
        options: {
            width: number;
            recipe: SourceImageRecipe;
        },
    ): Promise<SourceImageTransformResult>;
}
