import sharp, { type Sharp, versions } from "sharp";
import type { SourceImageRecipe } from "../../interfaces/recipe";
import type {
    SourceImageInputFormat,
    SourceImageMetadata,
    SourceImageTransformer,
    SourceImageTransformResult,
} from "../../interfaces/transformer";

export class SharpSourceImageTransformer implements SourceImageTransformer {
    readonly encoderIdentity = `sharp-${versions.sharp}-vips-${versions.vips}-webp-${versions.webp ?? "unknown"}`;

    async inspect(source: Uint8Array, recipe: SourceImageRecipe): Promise<SourceImageMetadata> {
        const pipeline = sharp(source, {
            animated: true,
            failOn: "warning",
            limitInputPixels: recipe.maxInputPixels,
        });
        const metadata = await runWithTimeout(pipeline, pipeline.metadata(), recipe.processingTimeoutMs);
        const format = normalizeFormat(metadata.format);
        if (!format || !metadata.width || !metadata.height) {
            throw new Error("unsupported or invalid source image");
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
        options: { width: number; recipe: SourceImageRecipe },
    ): Promise<SourceImageTransformResult> {
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
        pipeline.destroy(new Error("source image processing timed out"));
    }, timeoutMs);
    try {
        return await operation;
    } finally {
        clearTimeout(timer);
    }
}

function normalizeFormat(value: string | undefined): SourceImageInputFormat | null {
    if (value === "heif") {
        return "avif";
    }
    return value === "jpeg" || value === "png" || value === "webp" || value === "gif" || value === "avif"
        ? value
        : null;
}
