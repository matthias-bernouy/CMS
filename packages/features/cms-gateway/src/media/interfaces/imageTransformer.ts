export const GATEWAY_IMAGE_INPUT_FORMATS = ["jpeg", "png", "webp", "gif", "avif"] as const;
export type GatewayImageInputFormat = (typeof GATEWAY_IMAGE_INPUT_FORMATS)[number];

export interface GatewayImageRecipe {
    readonly maxInputPixels: number;
    readonly processingTimeoutMs: number;
    readonly quality: number;
}

export interface GatewayImageMetadata {
    readonly format: GatewayImageInputFormat;
    readonly width: number;
    readonly height: number;
    readonly pages: number;
}

export interface GatewayImageTransformResult {
    readonly bytes: Uint8Array;
    readonly width: number;
    readonly height: number;
}

export interface GatewayImageTransformer {
    readonly encoderIdentity: string;
    inspect(source: Uint8Array, recipe: GatewayImageRecipe): Promise<GatewayImageMetadata>;
    transform(
        source: Uint8Array,
        options: { readonly width: number; readonly recipe: GatewayImageRecipe },
    ): Promise<GatewayImageTransformResult>;
}
