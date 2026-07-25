import type { SourceEndpoint } from "@bernouy/cms-sources";
import type { SourceImageSingleFlight, SourceImageSemaphore } from "../../concurrency";
import { SourceImageFailure } from "../../pipeline";
import { publicSourceFreshness } from "../../policy";
import type { SourceImageCache } from "../../../interfaces/cache";
import type { SourceImageOutcome, SourceImageReason } from "../../../interfaces/observability";
import type { SourceImageRecipe } from "../../../interfaces/recipe";
import type { SourceImageTransformer } from "../../../interfaces/transformer";
import type { GeneratedDerivative } from "../generation";
import { invalidSourceImageResponse, sourceImageBusyResponse } from "../responses";
import { readValidatedSource } from "../sourceValidation";
import type { SourceImageRequestTelemetry } from "../telemetry";
import { derivativeFor, imageFailureReason, publishLookup } from "./derivative";

type UpstreamResultMetadata = {
    published: boolean;
    outcome: SourceImageOutcome;
    reason?: SourceImageReason;
};

export type UpstreamResult =
    | (UpstreamResultMetadata & { kind: "derivative"; derivative: GeneratedDerivative; freshUntil?: number })
    | (UpstreamResultMetadata & { kind: "response"; response: Response });

export type ProcessSourceImageUpstreamOptions = {
    endpoint: SourceEndpoint;
    request: Request;
    next: (request: Request) => Promise<Response>;
    logicalKey: string;
    lookupKey: string;
    telemetry: SourceImageRequestTelemetry;
    cache: SourceImageCache;
    transformer: SourceImageTransformer;
    recipe: SourceImageRecipe;
    semaphore: SourceImageSemaphore;
    semaphoreWaitTimeoutMs: number;
    readTimeoutMs: number;
    flights: SourceImageSingleFlight<GeneratedDerivative>;
    now: () => number;
};

export async function processSourceImageUpstream(options: ProcessSourceImageUpstreamOptions): Promise<UpstreamResult> {
    const releaseAdmission = await options.telemetry.measure("semaphore_wait", () =>
        options.semaphore.acquire(options.semaphoreWaitTimeoutMs),
    );
    if (!releaseAdmission) {
        await options.telemetry.finish("failed", "semaphore_saturated");
        return {
            kind: "response",
            response: sourceImageBusyResponse(),
            published: false,
            outcome: "failed",
            reason: "semaphore_saturated",
        };
    }
    try {
        return await processAdmittedSourceImageUpstream(options, releaseAdmission);
    } finally {
        releaseAdmission();
    }
}

async function processAdmittedSourceImageUpstream(
    options: ProcessSourceImageUpstreamOptions,
    releaseAdmission: () => void,
): Promise<UpstreamResult> {
    let upstream: Response;
    try {
        upstream = await options.telemetry.measure("upstream", () => options.next(options.request));
    } catch {
        await options.telemetry.finish("failed", "processing_failed");
        return {
            kind: "response",
            response: invalidSourceImageResponse("Bad Source"),
            published: false,
            outcome: "failed",
            reason: "processing_failed",
        };
    }
    if (upstream.status < 200 || upstream.status >= 300) {
        await options.telemetry.finish("upstream_response", "upstream_status");
        return {
            kind: "response",
            response: upstream,
            published: false,
            outcome: "upstream_response",
            reason: "upstream_status",
        };
    }
    if (!isExpectedFullImageStatus(options.endpoint, upstream.status)) {
        await upstream.body?.cancel().catch(() => undefined);
        await options.telemetry.finish("rejected", "upstream_status");
        return {
            kind: "response",
            response: invalidSourceImageResponse(),
            published: false,
            outcome: "rejected",
            reason: "upstream_status",
        };
    }
    const freshness = options.telemetry.policy === "public" ? publicSourceFreshness(upstream, options.now()) : null;
    let validated: { source: Uint8Array; width: number; release: () => void };
    try {
        validated = await readValidatedSource({
            upstream,
            recipe: options.recipe,
            transformer: options.transformer,
            telemetry: options.telemetry,
            readTimeoutMs: options.readTimeoutMs,
            releaseAdmission,
        });
    } catch (error) {
        const reason = error instanceof SourceImageFailure ? error.reason : "invalid_image";
        await options.telemetry.finish("rejected", reason);
        return {
            kind: "response",
            response: invalidSourceImageResponse(),
            published: false,
            outcome: "rejected",
            reason,
        };
    }
    try {
        const derivative = await derivativeFor(validated, options);
        options.telemetry.outputBytes = derivative.derivative.bytes.byteLength;
        options.telemetry.cache ??= derivative.fromCache ? "hit" : "miss";
        const published =
            freshness && derivative.stored ? await publishLookup(options, derivative.key, freshness.freshUntil) : false;
        const outcome = derivative.fromCache ? "cache_hit" : "generated";
        await options.telemetry.finish(outcome);
        return {
            kind: "derivative",
            derivative,
            ...(freshness ? { freshUntil: freshness.freshUntil } : {}),
            published,
            outcome,
        };
    } catch (error) {
        const reason = imageFailureReason(error);
        await options.telemetry.finish("failed", reason);
        return {
            kind: "response",
            response: invalidSourceImageResponse(),
            published: false,
            outcome: "failed",
            reason,
        };
    }
}

function isExpectedFullImageStatus(endpoint: SourceEndpoint, status: number): boolean {
    return (
        status === 200 &&
        (endpoint.output ?? []).some((output) => output.status === "200" || output.status === "default")
    );
}
