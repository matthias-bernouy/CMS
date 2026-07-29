import type { SourceEndpointInterceptor } from "@bernouy/cms-sources";
import type { SourceImageSemaphore } from "../concurrency";
import type { SourceImageCache } from "../../interfaces/cache";
import type { SourceImageJobFetch, SourceImageJobScheduler } from "../../interfaces/jobs";
import type { SourceImageMediaCoordinator } from "../../interfaces/media";
import type { SourceImageObserver } from "../../interfaces/observability";
import type { SourceImageRecipe } from "../../interfaces/recipe";
import type { SourceImageTransformer } from "../../interfaces/transformer";

export type LocalSourceImageJobsOptions = Readonly<{
    fetch?: SourceImageJobFetch;
    concurrency?: number;
    maxQueue?: number;
    semaphoreWaitTimeoutMs?: number;
    fetchTimeoutMs?: number;
}>;

export type PublicSourceImageMissMode = "inline" | "queued";

export type CreateSourceImageInterceptorOptions = {
    cache: SourceImageCache;
    transformer: SourceImageTransformer;
    scope: string;
    recipe?: SourceImageRecipe;
    semaphore?: SourceImageSemaphore;
    semaphoreWaitTimeoutMs?: number;
    jobScheduler?: SourceImageJobScheduler;
    localJobs?: LocalSourceImageJobsOptions;
    publicMissMode?: PublicSourceImageMissMode;
    mediaCoordinator?: SourceImageMediaCoordinator;
    readTimeoutMs?: number;
    observe?: SourceImageObserver;
    clock?: () => number;
};

export type SourceImageInterceptor = SourceEndpointInterceptor;
