import type { SourceImageSingleFlight } from "../concurrency";
import { sourceImageEtag } from "../identity";
import type { SourceImageCache, SourceImageDerivative } from "../../interfaces/cache";
import type { SourceImageRecipe } from "../../interfaces/recipe";
import type { SourceImageTransformer } from "../../interfaces/transformer";
import type { SourceImageRequestTelemetry } from "./telemetry";

export type GeneratedDerivative = {
    key: string;
    derivative: SourceImageDerivative;
    stored: boolean;
    fromCache: boolean;
};

export async function resolveDerivative(options: {
    key: string;
    source: Uint8Array;
    effectiveWidth: number;
    cache: SourceImageCache;
    transformer: SourceImageTransformer;
    recipe: SourceImageRecipe;
    releaseAdmission: () => void;
    flights: SourceImageSingleFlight<GeneratedDerivative>;
    telemetry: SourceImageRequestTelemetry;
    now: () => number;
}): Promise<GeneratedDerivative> {
    const cached = await safeGet(options.cache, options.key, options.telemetry);
    if (cached) {
        options.releaseAdmission();
        return { key: options.key, derivative: cached, stored: true, fromCache: true };
    }
    const flight = options.flights.run(options.key, async () => {
        const racedCache = await safeGet(options.cache, options.key, options.telemetry);
        if (racedCache) {
            return { key: options.key, derivative: racedCache, stored: true, fromCache: true };
        }
        try {
            const transformed = await options.telemetry.measure("encode", () =>
                options.transformer.transform(options.source, {
                    width: options.effectiveWidth,
                    recipe: options.recipe,
                }),
            );
            if (transformed.width !== options.effectiveWidth || transformed.height < 1 || !isWebP(transformed.bytes)) {
                throw new Error("source image transformer returned an invalid derivative");
            }
            const derivative: SourceImageDerivative = {
                bytes: transformed.bytes,
                etag: await sourceImageEtag(transformed.bytes),
                contentType: "image/webp",
                width: transformed.width,
                height: transformed.height,
                createdAt: options.now(),
            };
            try {
                const write = await options.telemetry.measure("store", () =>
                    options.cache.putDerivative(options.key, derivative),
                );
                options.telemetry.evicted += write.evicted;
                return { key: options.key, derivative, stored: true, fromCache: false };
            } catch {
                options.telemetry.cacheErrors += 1;
                return { key: options.key, derivative, stored: false, fromCache: false };
            }
        } finally {
            options.releaseAdmission();
        }
    });
    if (flight.joined) {
        options.telemetry.joinedSingleFlight = true;
        options.releaseAdmission();
    }
    return flight.promise;
}

async function safeGet(
    cache: SourceImageCache,
    key: string,
    telemetry: SourceImageRequestTelemetry,
): Promise<SourceImageDerivative | null> {
    try {
        return await cache.getDerivative(key);
    } catch {
        telemetry.cacheErrors += 1;
        return null;
    }
}

function isWebP(bytes: Uint8Array): boolean {
    return (
        bytes.byteLength >= 12 &&
        String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
        String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
    );
}
