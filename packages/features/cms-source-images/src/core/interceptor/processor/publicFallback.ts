import { createSourceImageJob } from "../../jobs";
import { sourceImageLookupKey } from "../../identity";
import type { SourceImageJobScheduler } from "../../../interfaces/jobs";
import type { SourceImageReason } from "../../../interfaces/observability";
import type { SourceImageMediaContext } from "../../../interfaces/media";
import type { SourceImageRecipe, SourceImageWidth } from "../../../interfaces/recipe";
import { invalidSourceImageResponse, sourceImageFallbackResponse } from "../responses";
import type { SourceImageRequestTelemetry } from "../telemetry";
import type { UpstreamResult } from "../upstream";

type Next = (request: Request) => Promise<Response>;

type PublicFallbackOptions = {
    scheduler: SourceImageJobScheduler;
    scope: string;
    recipe: SourceImageRecipe;
    encoderIdentity: string;
};

type PublicFallbackRequest = {
    request: Request;
    next: Next;
    logicalKey: string;
    lookupKey: string;
    width: SourceImageWidth;
    telemetry: SourceImageRequestTelemetry;
    reason: Extract<SourceImageReason, "job_queued" | "semaphore_saturated">;
    media?: SourceImageMediaContext;
};

export class PublicSourceImageFallback {
    constructor(private readonly options: PublicFallbackOptions) {}

    async respond(input: PublicFallbackRequest): Promise<UpstreamResult> {
        let upstream: Response;
        try {
            upstream = await input.telemetry.measure("upstream", () => input.next(input.request));
        } catch {
            await input.telemetry.finish("failed", "processing_failed");
            return responseResult(invalidSourceImageResponse("Bad Source"), "failed", "processing_failed");
        }
        if (!upstream.ok) {
            await input.telemetry.finish("upstream_response", "upstream_status");
            return responseResult(upstream, "upstream_response", "upstream_status");
        }
        await this.schedule(input);
        await input.telemetry.finish("fallback", input.reason);
        return responseResult(sourceImageFallbackResponse(upstream), "fallback", input.reason);
    }

    private async schedule(input: PublicFallbackRequest): Promise<void> {
        try {
            await this.options.scheduler.enqueue(await this.createJob(input));
        } catch {
            // The original remains available; the next miss retries scheduling.
        }
    }

    private async createJob(input: PublicFallbackRequest) {
        const variants = await Promise.all(
            this.options.recipe.widths.map(async (width) => ({
                width,
                lookupKey:
                    width === input.width
                        ? input.lookupKey
                        : await sourceImageLookupKey({
                              logicalKey: input.logicalKey,
                              width,
                              recipe: this.options.recipe,
                              encoderIdentity: this.options.encoderIdentity,
                          }),
            })),
        );
        return createSourceImageJob({
            scope: this.options.scope,
            request: input.request,
            logicalKey: input.logicalKey,
            variants,
            recipe: this.options.recipe,
            encoderIdentity: this.options.encoderIdentity,
            ...(input.media ? { asset: input.media.asset, priority: "media-critical" as const } : {}),
        });
    }
}

function responseResult(
    response: Response,
    outcome: UpstreamResult["outcome"],
    reason: NonNullable<UpstreamResult["reason"]>,
): UpstreamResult {
    return { kind: "response", response, published: false, outcome, reason };
}
