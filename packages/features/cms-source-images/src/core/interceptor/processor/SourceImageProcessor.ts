import { sourceEndpointAccessMode, type SourceEndpoint } from "@bernouy/cms-sources";
import { SourceImageSemaphore, SourceImageSingleFlight } from "../../concurrency";
import { sourceImageLogicalKey, sourceImageLookupKey, sourceImagePublicFlightKey } from "../../identity";
import { requestedSourceImageTransform } from "../../pipeline";
import { immutableSourceImageRecipe, SOURCE_RESPONSIVE_WEBP_V1 } from "../../recipe";
import type { GeneratedDerivative } from "../generation";
import { invalidSourceImageResponse } from "../responses";
import { SourceImageRequestTelemetry } from "../telemetry";
import type { CreateSourceImageInterceptorOptions } from "../types";
import { processSourceImageUpstream, type UpstreamResult } from "../upstream";
import { publicDerivativeResponse, responseFromUpstreamResult } from "./publicCache";

type Next = (request: Request) => Promise<Response>;

export class SourceImageProcessor {
    private readonly recipe;
    private readonly semaphore;
    private readonly finalFlights = new SourceImageSingleFlight<GeneratedDerivative>();
    private readonly publicFlights = new SourceImageSingleFlight<UpstreamResult>();
    private readonly now;
    private readonly readTimeoutMs;
    private readonly semaphoreWaitTimeoutMs;

    constructor(private readonly options: CreateSourceImageInterceptorOptions) {
        if (!options.scope.trim()) {
            throw new TypeError("source image cache scope is required");
        }
        this.recipe = immutableSourceImageRecipe(options.recipe ?? SOURCE_RESPONSIVE_WEBP_V1);
        this.semaphore = options.semaphore ?? new SourceImageSemaphore(2);
        this.now = options.clock ?? Date.now;
        this.readTimeoutMs = options.readTimeoutMs ?? 10_000;
        this.semaphoreWaitTimeoutMs = options.semaphoreWaitTimeoutMs ?? 250;
    }

    intercept = async (endpoint: SourceEndpoint, request: Request, next: Next): Promise<Response> => {
        const telemetry = new SourceImageRequestTelemetry(request, this.options.observe, this.now);
        const requested = requestedSourceImageTransform(endpoint, request, this.recipe.widths);
        if (requested.kind === "passthrough") {
            await telemetry.finish("passthrough", requested.reason);
            return next(request);
        }
        if (requested.kind === "reject") {
            await telemetry.finish("rejected", requested.reason);
            return requested.response;
        }
        telemetry.width = requested.width;
        telemetry.policy =
            sourceEndpointAccessMode(endpoint) === "public" && !usesCallerComputedIdentity(endpoint)
                ? "public"
                : "private";
        try {
            return await this.processTransform(endpoint, requested.request, requested.width, next, telemetry);
        } catch {
            await telemetry.finish("failed", "processing_failed");
            return invalidSourceImageResponse();
        }
    };

    private async processTransform(
        endpoint: SourceEndpoint,
        request: Request,
        width: number,
        next: Next,
        telemetry: SourceImageRequestTelemetry,
    ): Promise<Response> {
        const logicalKey = await sourceImageLogicalKey({
            scope: this.options.scope,
            endpoint,
            request,
            policy: telemetry.policy!,
        });
        const lookupKey = await sourceImageLookupKey({
            logicalKey,
            width,
            recipe: this.recipe,
            encoderIdentity: this.options.transformer.encoderIdentity,
        });
        if (telemetry.policy === "private") {
            const result = await this.processUpstream(endpoint, request, next, logicalKey, lookupKey, telemetry);
            return responseFromUpstreamResult(result, request, this.now(), false);
        }
        const cached = await publicDerivativeResponse({
            cache: this.options.cache,
            lookupKey,
            request,
            telemetry,
            now: this.now,
        });
        if (cached) {
            return cached;
        }
        telemetry.cache ??= "miss";
        const flightKey = await sourceImagePublicFlightKey(lookupKey);
        const flight = this.publicFlights.run(flightKey, () =>
            this.processUpstream(endpoint, request, next, logicalKey, lookupKey, telemetry),
        );
        const result = await flight.promise;
        if (flight.joined) {
            telemetry.joinedSingleFlight = true;
            if (result.kind === "derivative") {
                telemetry.outputBytes = result.derivative.derivative.bytes.byteLength;
            }
            await telemetry.finish(result.outcome, result.reason);
        }
        return responseFromUpstreamResult(result, request, this.now(), flight.joined);
    }

    private async processUpstream(
        endpoint: SourceEndpoint,
        request: Request,
        next: Next,
        logicalKey: string,
        lookupKey: string,
        telemetry: SourceImageRequestTelemetry,
    ): Promise<UpstreamResult> {
        return processSourceImageUpstream({
            endpoint,
            request,
            next,
            logicalKey,
            lookupKey,
            telemetry,
            cache: this.options.cache,
            transformer: this.options.transformer,
            recipe: this.recipe,
            semaphore: this.semaphore,
            semaphoreWaitTimeoutMs: this.semaphoreWaitTimeoutMs,
            readTimeoutMs: this.readTimeoutMs,
            flights: this.finalFlights,
            now: this.now,
        });
    }
}

function usesCallerComputedIdentity(endpoint: SourceEndpoint): boolean {
    return (
        (endpoint.input?.params ?? []).some((param) => param.source?.from === "computed") ||
        (endpoint.headers ?? []).some((header) => header.source.from === "computed")
    );
}
