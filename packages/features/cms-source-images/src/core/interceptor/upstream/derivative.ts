import { sourceImageDerivativeKey, sourceImageDigest } from "../../identity";
import { resolveDerivative, type GeneratedDerivative } from "../generation";
import type { ProcessSourceImageUpstreamOptions } from "./process";

export async function derivativeFor(
    validated: { source: Uint8Array; width: number; release: () => void },
    options: ProcessSourceImageUpstreamOptions,
): Promise<GeneratedDerivative> {
    try {
        const effectiveWidth = Math.min(options.telemetry.width!, validated.width);
        const key = await sourceImageDerivativeKey({
            logicalKey: options.logicalKey,
            sourceDigest: await sourceImageDigest(validated.source),
            effectiveWidth,
            recipe: options.recipe,
            encoderIdentity: options.transformer.encoderIdentity,
        });
        return await resolveDerivative({
            key,
            source: validated.source,
            effectiveWidth,
            cache: options.cache,
            transformer: options.transformer,
            recipe: options.recipe,
            releaseAdmission: validated.release,
            flights: options.flights,
            telemetry: options.telemetry,
            now: options.now,
        });
    } finally {
        validated.release();
    }
}

export async function publishLookup(
    options: ProcessSourceImageUpstreamOptions,
    derivativeKey: string,
    freshUntil: number,
): Promise<boolean> {
    try {
        await options.cache.putLookup(options.lookupKey, {
            derivativeKey,
            freshUntil,
            createdAt: options.now(),
        });
        return true;
    } catch {
        options.telemetry.cacheErrors += 1;
        return false;
    }
}

export function imageFailureReason(error: unknown): "pixel_limit" | "processing_failed" {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    return message.includes("pixel") && message.includes("limit") ? "pixel_limit" : "processing_failed";
}
