import { MAX_PUBLIC_SOURCE_FRESHNESS_MS } from "../../policy";
import type { SourceImageCache } from "../../../interfaces/cache";
import { derivativeResponse } from "../responses";
import type { SourceImageRequestTelemetry } from "../telemetry";
import type { UpstreamResult } from "../upstream";

export async function publicDerivativeResponse(options: {
    cache: SourceImageCache;
    lookupKey: string;
    request: Request;
    telemetry: SourceImageRequestTelemetry;
    now: () => number;
}): Promise<Response | null> {
    let lookup;
    try {
        lookup = await options.cache.getLookup(options.lookupKey);
    } catch {
        options.telemetry.cacheErrors += 1;
        return null;
    }
    if (!lookup) {
        return null;
    }
    const now = options.now();
    if (
        !Number.isFinite(lookup.createdAt) ||
        !Number.isFinite(lookup.freshUntil) ||
        lookup.createdAt < 0 ||
        lookup.freshUntil < 0 ||
        lookup.createdAt > now ||
        lookup.freshUntil <= now ||
        lookup.freshUntil <= lookup.createdAt ||
        lookup.freshUntil - lookup.createdAt > MAX_PUBLIC_SOURCE_FRESHNESS_MS
    ) {
        options.telemetry.cache = "stale";
        await deleteLookup(options);
        return null;
    }
    let derivative;
    try {
        derivative = await options.cache.getDerivative(lookup.derivativeKey);
    } catch {
        options.telemetry.cacheErrors += 1;
        derivative = null;
    }
    if (!derivative) {
        options.telemetry.cache = "miss";
        await deleteLookup(options);
        return null;
    }
    options.telemetry.cache = "hit";
    options.telemetry.outputBytes = derivative.bytes.byteLength;
    await options.telemetry.finish("cache_hit");
    return derivativeResponse(derivative, options.request, {
        freshUntil: lookup.freshUntil,
        now,
    });
}

export function responseFromUpstreamResult(
    result: UpstreamResult,
    request: Request,
    now: number,
    joined: boolean,
): Response {
    if (result.kind === "derivative") {
        return derivativeResponse(result.derivative.derivative, request, {
            ...(result.freshUntil !== undefined ? { freshUntil: result.freshUntil } : {}),
            now,
        });
    }
    return joined ? result.response.clone() : result.response;
}

async function deleteLookup(options: {
    cache: SourceImageCache;
    lookupKey: string;
    telemetry: SourceImageRequestTelemetry;
}): Promise<void> {
    try {
        await options.cache.deleteLookup(options.lookupKey);
    } catch {
        options.telemetry.cacheErrors += 1;
    }
}
