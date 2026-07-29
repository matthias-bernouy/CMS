import { InProcessSourceImageJobScheduler, publicSourceOrigin, SourceImageJobWorker } from "../../jobs";
import type { SourceImageSingleFlight, SourceImageSemaphore } from "../../concurrency";
import type { SourceImageCache } from "../../../interfaces/cache";
import type { SourceImageJob, SourceImageJobHandler, SourceImageJobScheduler } from "../../../interfaces/jobs";
import type { SourceImageObserver } from "../../../interfaces/observability";
import type { SourceImageRecipe } from "../../../interfaces/recipe";
import type { SourceImageTransformer } from "../../../interfaces/transformer";
import type { GeneratedDerivative } from "../generation";
import type { LocalSourceImageJobsOptions } from "../types";

export function createLocalSourceImageJobScheduler(options: {
    scope: string;
    cache: SourceImageCache;
    transformer: SourceImageTransformer;
    recipe: SourceImageRecipe;
    semaphore: SourceImageSemaphore;
    flights: SourceImageSingleFlight<GeneratedDerivative>;
    readTimeoutMs: number;
    observe?: SourceImageObserver;
    clock: () => number;
    local?: LocalSourceImageJobsOptions;
}): SourceImageJobScheduler {
    const configuredOrigin = publicSourceOrigin(options.scope);
    const createWorker = (origin: string) =>
        new SourceImageJobWorker({
            allowedSourceOrigins: [origin],
            cache: options.cache,
            transformer: options.transformer,
            recipe: options.recipe,
            semaphore: options.semaphore,
            flights: options.flights,
            readTimeoutMs: options.readTimeoutMs,
            observe: options.observe,
            clock: options.clock,
            ...(options.local?.fetch ? { fetch: options.local.fetch } : {}),
            ...(options.local?.semaphoreWaitTimeoutMs !== undefined
                ? { semaphoreWaitTimeoutMs: options.local.semaphoreWaitTimeoutMs }
                : {}),
            ...(options.local?.fetchTimeoutMs !== undefined ? { fetchTimeoutMs: options.local.fetchTimeoutMs } : {}),
        });
    const worker = configuredOrigin ? createWorker(configuredOrigin) : null;
    const handler: SourceImageJobHandler = worker ?? {
        handle: (job: SourceImageJob) => createWorker(new URL(job.source.url).origin).handle(job),
    };
    return new InProcessSourceImageJobScheduler(handler, {
        ...(options.local?.concurrency !== undefined ? { concurrency: options.local.concurrency } : {}),
        ...(options.local?.maxQueue !== undefined ? { maxQueue: options.local.maxQueue } : {}),
    });
}
