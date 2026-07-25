import { readBoundedImage, SourceImageFailure, validateDecodedImage, validateSourceImageResponse } from "../pipeline";
import type { SourceImageRecipe } from "../../interfaces/recipe";
import type { SourceImageTransformer } from "../../interfaces/transformer";
import type { SourceImageRequestTelemetry } from "./telemetry";

export async function readValidatedSource(options: {
    upstream: Response;
    recipe: SourceImageRecipe;
    transformer: SourceImageTransformer;
    telemetry: SourceImageRequestTelemetry;
    readTimeoutMs: number;
    releaseAdmission: () => void;
}): Promise<{ source: Uint8Array; width: number; release: () => void }> {
    let source: Uint8Array;
    try {
        source = await options.telemetry.measure("read", () =>
            readBoundedImage(options.upstream, options.recipe.maxSourceBytes, options.readTimeoutMs),
        );
    } catch (error) {
        if (error instanceof SourceImageFailure) {
            throw error;
        }
        throw new SourceImageFailure("invalid_image", "source image could not be read");
    }
    options.telemetry.sourceBytes = source.byteLength;
    try {
        const detected = validateSourceImageResponse(options.upstream, source);
        const metadata = await options.telemetry.measure("decode", () =>
            options.transformer.inspect(source, options.recipe),
        );
        validateDecodedImage(metadata, detected, options.recipe.maxInputPixels);
        return { source, width: metadata.width, release: options.releaseAdmission };
    } catch (error) {
        if (error instanceof SourceImageFailure) {
            throw error;
        }
        const message = error instanceof Error ? error.message.toLowerCase() : "";
        const reason = message.includes("pixel") && message.includes("limit") ? "pixel_limit" : "invalid_image";
        throw new SourceImageFailure(reason, "source image could not be decoded");
    }
}
