import { SourceImageSemaphore, SourceImageSingleFlight } from "../concurrency";
import { immutableSourceImageRecipe, SOURCE_RESPONSIVE_WEBP_V1 } from "../recipe";
import { MAX_PUBLIC_SOURCE_FRESHNESS_MS, publicSourceFreshness } from "../policy";
import { SourceImageFailure } from "../pipeline";
import type { SourceImageCache } from "../../interfaces/cache";
import type {
    SourceImageJob,
    SourceImageJobFetch,
    SourceImageJobHandler,
    SourceImageJobResult,
} from "../../interfaces/jobs";
import type { SourceImageObserver } from "../../interfaces/observability";
import type { SourceImageRecipe } from "../../interfaces/recipe";
import type { SourceImageTransformer } from "../../interfaces/transformer";
import type { GeneratedDerivative } from "../interceptor/generation";
import { SourceImageRequestTelemetry } from "../interceptor/telemetry";
import { readValidatedSource } from "../interceptor/sourceValidation";
import { normalizedSourceImageOrigins, validateSourceImageJob } from "./validation";
import { generateSourceImageVariantSet } from "./variantSet";

export type SourceImageJobWorkerOptions = Readonly<{
    allowedSourceOrigins: readonly string[];
    cache: SourceImageCache;
    transformer: SourceImageTransformer;
    recipe?: SourceImageRecipe;
    fetch?: SourceImageJobFetch;
    semaphore?: SourceImageSemaphore;
    flights?: SourceImageSingleFlight<GeneratedDerivative>;
    semaphoreWaitTimeoutMs?: number;
    readTimeoutMs?: number;
    fetchTimeoutMs?: number;
    observe?: SourceImageObserver;
    clock?: () => number;
    isAssetCurrent?: (asset: NonNullable<SourceImageJob["asset"]>) => Promise<boolean>;
}>;

export class SourceImageJobWorker implements SourceImageJobHandler {
    private readonly allowedOrigins;
    private readonly recipe;
    private readonly fetchSource;
    private readonly semaphore;
    private readonly flights;
    private readonly now;

    constructor(private readonly options: SourceImageJobWorkerOptions) {
        this.allowedOrigins = normalizedSourceImageOrigins(options.allowedSourceOrigins);
        this.recipe = immutableSourceImageRecipe(options.recipe ?? SOURCE_RESPONSIVE_WEBP_V1);
        this.fetchSource = options.fetch ?? ((request) => fetch(request));
        this.semaphore = options.semaphore ?? new SourceImageSemaphore(1);
        this.flights = options.flights ?? new SourceImageSingleFlight<GeneratedDerivative>();
        this.now = options.clock ?? Date.now;
    }

    async handle(job: SourceImageJob): Promise<SourceImageJobResult> {
        const request = await validateSourceImageJob({
            job,
            recipe: this.recipe,
            encoderIdentity: this.options.transformer.encoderIdentity,
            allowedOrigins: this.allowedOrigins,
        });
        if (!request) {
            return { disposition: "discarded", reason: "invalid_job" };
        }
        const telemetry = new SourceImageRequestTelemetry(request, this.options.observe, this.now);
        telemetry.policy = "public";
        telemetry.width = job.variants.at(-1)?.width;
        telemetry.cache = "miss";
        const release = await this.semaphore.acquire(this.options.semaphoreWaitTimeoutMs ?? 60_000);
        if (!release) {
            return { disposition: "retry", reason: "semaphore_saturated" };
        }
        try {
            return await this.process(job, request, telemetry);
        } finally {
            release();
        }
    }

    private fetchWithTimeout(request: Request): Promise<Response> {
        const signal = AbortSignal.timeout(this.options.fetchTimeoutMs ?? 20_000);
        return this.fetchSource(new Request(request, { signal }));
    }

    private async process(
        job: SourceImageJob,
        request: Request,
        telemetry: SourceImageRequestTelemetry,
    ): Promise<SourceImageJobResult> {
        let upstream: Response;
        try {
            upstream = await telemetry.measure("upstream", () => this.fetchWithTimeout(request));
        } catch {
            return { disposition: "retry", reason: "processing_failed" };
        }
        if (upstream.status !== 200) {
            await upstream.body?.cancel().catch(() => undefined);
            return retryableStatus(upstream.status)
                ? { disposition: "retry", reason: "upstream_status" }
                : { disposition: "discarded", reason: "upstream_status" };
        }
        const freshness = publicSourceFreshness(upstream, this.now());
        const freshUntil = freshness?.freshUntil ?? this.now() + MAX_PUBLIC_SOURCE_FRESHNESS_MS;
        try {
            const validated = await readValidatedSource({
                upstream,
                recipe: this.recipe,
                transformer: this.options.transformer,
                telemetry,
                readTimeoutMs: this.options.readTimeoutMs ?? 10_000,
                releaseAdmission: () => undefined,
            });
            const status = await generateSourceImageVariantSet({
                job,
                source: validated.source,
                sourceWidth: validated.width,
                freshUntil,
                cache: this.options.cache,
                transformer: this.options.transformer,
                recipe: this.recipe,
                flights: this.flights,
                telemetry,
                now: this.now,
                ...(job.asset && this.options.isAssetCurrent
                    ? { isCurrent: () => this.options.isAssetCurrent!(job.asset!) }
                    : {}),
            });
            if (status.status === "stale") {
                return { disposition: "discarded", reason: "invalid_job" };
            }
            await telemetry.finish("generated");
            return { disposition: "completed", variants: status.variants };
        } catch (error) {
            const reason = error instanceof SourceImageFailure ? error.reason : "processing_failed";
            return retryableReason(reason) ? { disposition: "retry", reason } : { disposition: "discarded", reason };
        }
    }
}

function retryableStatus(status: number): boolean {
    return status === 408 || status === 425 || status === 429 || status >= 500;
}

function retryableReason(reason: SourceImageJobResult extends infer _ ? string : never): boolean {
    return reason === "processing_failed" || reason === "read_timeout";
}
