import { sourceImageDerivativeKey, sourceImageDigest } from "../identity";
import { resolveDerivative, type GeneratedDerivative } from "../interceptor/generation";
import type { SourceImageSingleFlight } from "../concurrency";
import type { SourceImageCache } from "../../interfaces/cache";
import type { SourceImageJob } from "../../interfaces/jobs";
import type { SourceImageRecipe } from "../../interfaces/recipe";
import type { SourceImageTransformer } from "../../interfaces/transformer";
import type { SourceImageRequestTelemetry } from "../interceptor/telemetry";

export async function generateSourceImageVariantSet(options: {
    job: SourceImageJob;
    source: Uint8Array;
    sourceWidth: number;
    freshUntil: number;
    cache: SourceImageCache;
    transformer: SourceImageTransformer;
    recipe: SourceImageRecipe;
    flights: SourceImageSingleFlight<GeneratedDerivative>;
    telemetry: SourceImageRequestTelemetry;
    now: () => number;
    isCurrent?: () => Promise<boolean>;
}): Promise<
    | Readonly<{
          status: "completed";
          variants: readonly Readonly<{
              width: (typeof options.job.variants)[number]["width"];
              lookupKey: string;
              derivativeKey: string;
          }>[];
      }>
    | Readonly<{ status: "stale" }>
> {
    const digest = await sourceImageDigest(options.source);
    const generated = new Map<number, GeneratedDerivative>();
    const completed = [];
    for (const variant of options.job.variants) {
        const effectiveWidth = Math.min(variant.width, options.sourceWidth);
        let derivative = generated.get(effectiveWidth);
        if (!derivative) {
            const key = await sourceImageDerivativeKey({
                logicalKey: options.job.logicalKey,
                sourceDigest: digest,
                effectiveWidth,
                recipe: options.recipe,
                encoderIdentity: options.transformer.encoderIdentity,
            });
            derivative = await resolveDerivative({
                key,
                source: options.source,
                effectiveWidth,
                cache: options.cache,
                transformer: options.transformer,
                recipe: options.recipe,
                releaseAdmission: () => undefined,
                flights: options.flights,
                telemetry: options.telemetry,
                now: options.now,
            });
            generated.set(effectiveWidth, derivative);
        }
        if (!derivative.stored) {
            throw new Error("source image derivative could not be stored");
        }
        if (options.isCurrent && !(await options.isCurrent())) {
            return { status: "stale" };
        }
        await options.cache.putLookup(variant.lookupKey, {
            derivativeKey: derivative.key,
            freshUntil: options.freshUntil,
            createdAt: options.now(),
        });
        completed.push({ width: variant.width, lookupKey: variant.lookupKey, derivativeKey: derivative.key });
    }
    return { status: "completed", variants: completed };
}
