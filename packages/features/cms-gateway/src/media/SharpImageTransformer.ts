import { SharpImageTransformer as SharpByteTransformer } from "@bernouy/image-processing/sharp";
import type {
    GatewayImageInputFormat,
    GatewayImageMetadata,
    GatewayImageRecipe,
    GatewayImageTransformer,
    GatewayImageTransformResult,
} from "./imageTransformer";

/** Gateway policy over the generic byte transformer. */
export class SharpImageTransformer implements GatewayImageTransformer {
    readonly #transformer = new SharpByteTransformer();
    readonly encoderIdentity = this.#transformer.encoderIdentity;

    async inspect(source: Uint8Array, recipe: GatewayImageRecipe): Promise<GatewayImageMetadata> {
        const metadata = await this.#transformer.inspect(source, {
            maxInputPixels: recipe.maxInputPixels,
            timeoutMs: recipe.processingTimeoutMs,
            strict: true,
        });
        const format = normalizeFormat(metadata.format);
        if (!format) {
            throw new Error("unsupported or invalid image");
        }
        return { ...metadata, format };
    }

    transform(
        source: Uint8Array,
        options: { readonly width: number; readonly recipe: GatewayImageRecipe },
    ): Promise<GatewayImageTransformResult> {
        return this.#transformer.transform(source, {
            width: options.width,
            quality: options.recipe.quality,
            maxInputPixels: options.recipe.maxInputPixels,
            timeoutMs: options.recipe.processingTimeoutMs,
            strict: true,
            autoOrient: true,
            colourspace: "srgb",
        });
    }
}

function normalizeFormat(value: string): GatewayImageInputFormat | null {
    if (value === "heif") {
        return "avif";
    }
    return value === "jpeg" || value === "png" || value === "webp" || value === "gif" || value === "avif"
        ? value
        : null;
}
