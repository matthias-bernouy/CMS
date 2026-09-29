import sharp, { type Sharp } from "sharp";
import type {
    GatewayImageInputFormat,
    GatewayImageMetadata,
    GatewayImageRecipe,
    GatewayImageTransformer,
    GatewayImageTransformResult,
} from "./imageTransformer";

/** Byte transformation shared by provider-file derivatives and transitional Source images. */
export class SharpImageTransformer implements GatewayImageTransformer {
    readonly encoderIdentity =
        `sharp-${sharp.versions.sharp}-vips-${sharp.versions.vips}-webp-${sharp.versions.webp ?? "unknown"}`;

    async inspect(source: Uint8Array, recipe: GatewayImageRecipe): Promise<GatewayImageMetadata> {
        const pipeline = sharp(source, {
            animated: true,
            failOn: "warning",
            limitInputPixels: recipe.maxInputPixels,
        });
        const metadata = await runWithTimeout(pipeline, pipeline.metadata(), recipe.processingTimeoutMs);
        const format = normalizeFormat(metadata.format);
        if (!format || !metadata.width || !metadata.height) {
            throw new Error("unsupported or invalid image");
        }
        return {
            format,
            width: metadata.autoOrient.width,
            height: metadata.autoOrient.height,
            pages: metadata.pages ?? 1,
        };
    }

    async transform(
        source: Uint8Array,
        options: { readonly width: number; readonly recipe: GatewayImageRecipe },
    ): Promise<GatewayImageTransformResult> {
        const pipeline = sharp(source, {
            animated: false,
            failOn: "warning",
            limitInputPixels: options.recipe.maxInputPixels,
        })
            .rotate()
            .toColourspace("srgb")
            .resize({ width: options.width, withoutEnlargement: true })
            .webp({ quality: options.recipe.quality });
        const { data, info } = await runWithTimeout(
            pipeline,
            pipeline.toBuffer({ resolveWithObject: true }),
            options.recipe.processingTimeoutMs,
        );
        return { bytes: new Uint8Array(data), width: info.width, height: info.height };
    }
}

async function runWithTimeout<T>(pipeline: Sharp, operation: Promise<T>, timeoutMs: number): Promise<T> {
    const timer = setTimeout(() => {
        pipeline.destroy(new Error("image processing timed out"));
    }, timeoutMs);
    try {
        return await operation;
    } finally {
        clearTimeout(timer);
    }
}

function normalizeFormat(value: string | undefined): GatewayImageInputFormat | null {
    if (value === "heif") {
        return "avif";
    }
    return value === "jpeg" || value === "png" || value === "webp" || value === "gif" || value === "avif"
        ? value
        : null;
}
