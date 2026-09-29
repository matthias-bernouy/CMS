import sharp, { type Sharp } from "sharp";
import type {
    ImageDecodeOptions,
    ImageMetadata,
    ImageTransformer,
    ImageTransformOptions,
    ImageTransformResult,
} from "../interfaces/ImageTransformer";

/** Generic Sharp adapter; caller policy controls limits and normalization. */
export class SharpImageTransformer implements ImageTransformer {
    readonly encoderIdentity =
        `sharp-${sharp.versions.sharp}-vips-${sharp.versions.vips}-webp-${sharp.versions.webp ?? "unknown"}`;

    async inspect(source: Uint8Array, options: ImageDecodeOptions = {}): Promise<ImageMetadata> {
        validateDecodeOptions(options);
        const pipeline = sharp(source, { animated: true, ...decodeOptions(options) });
        const metadata = await runWithTimeout(pipeline, pipeline.metadata(), options.timeoutMs);
        if (!metadata.format || !metadata.width || !metadata.height) {
            throw new Error("unsupported or invalid image");
        }
        return {
            format: metadata.format,
            width: metadata.autoOrient.width,
            height: metadata.autoOrient.height,
            pages: metadata.pages ?? 1,
        };
    }

    async transform(source: Uint8Array, options: ImageTransformOptions): Promise<ImageTransformResult> {
        validateDecodeOptions(options);
        if (!Number.isSafeInteger(options.width) || options.width < 1) {
            throw new TypeError("image width must be a positive integer");
        }
        if (!Number.isSafeInteger(options.quality) || options.quality < 1 || options.quality > 100) {
            throw new TypeError("image quality must be between 1 and 100");
        }
        let pipeline = sharp(source, { animated: false, ...decodeOptions(options) });
        if (options.autoOrient) {
            pipeline = pipeline.rotate();
        }
        if (options.colourspace === "srgb") {
            pipeline = pipeline.toColourspace("srgb");
        }
        pipeline = pipeline
            .resize({ width: options.width, withoutEnlargement: true })
            .webp({ quality: options.quality });
        const { data, info } = await runWithTimeout(
            pipeline,
            pipeline.toBuffer({ resolveWithObject: true }),
            options.timeoutMs,
        );
        return { bytes: new Uint8Array(data), width: info.width, height: info.height };
    }
}

function decodeOptions(options: ImageDecodeOptions) {
    return {
        ...(options.strict ? { failOn: "warning" as const } : {}),
        ...(options.maxInputPixels === undefined ? {} : { limitInputPixels: options.maxInputPixels }),
    };
}

function validateDecodeOptions(options: ImageDecodeOptions): void {
    for (const value of [options.maxInputPixels, options.timeoutMs]) {
        if (value !== undefined && (!Number.isSafeInteger(value) || value < 1)) {
            throw new TypeError("image processing limits must be positive integers");
        }
    }
}

async function runWithTimeout<T>(pipeline: Sharp, operation: Promise<T>, timeoutMs?: number): Promise<T> {
    if (timeoutMs === undefined) {
        return operation;
    }
    const timer = setTimeout(() => {
        pipeline.destroy(new Error("image processing timed out"));
    }, timeoutMs);
    try {
        return await operation;
    } finally {
        clearTimeout(timer);
    }
}
