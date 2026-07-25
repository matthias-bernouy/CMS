import type { SourceEndpointInterceptor } from "@bernouy/cms-sources";
import type { SourceImageSemaphore } from "../concurrency";
import type { SourceImageCache } from "../../interfaces/cache";
import type { SourceImageObserver } from "../../interfaces/observability";
import type { SourceImageRecipe } from "../../interfaces/recipe";
import type { SourceImageTransformer } from "../../interfaces/transformer";

export type CreateSourceImageInterceptorOptions = {
    cache: SourceImageCache;
    transformer: SourceImageTransformer;
    scope: string;
    recipe?: SourceImageRecipe;
    semaphore?: SourceImageSemaphore;
    semaphoreWaitTimeoutMs?: number;
    readTimeoutMs?: number;
    observe?: SourceImageObserver;
    clock?: () => number;
};

export type SourceImageInterceptor = SourceEndpointInterceptor;
