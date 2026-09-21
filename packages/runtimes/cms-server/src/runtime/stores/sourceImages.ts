import {
    createSourceMediaEffectInterceptor,
    DefaultSourceImageMediaCoordinator,
    SOURCE_RESPONSIVE_WEBP_V1,
    SourceImageJobRunner,
    SourceImageJobWorker,
    type SourceImageCache,
    type SourceImageJobQueue,
    type SourceImageMediaCoordinator,
    type SourceMediaIndex,
} from "@bernouy/cms-source-images";
import { SharpSourceImageTransformer } from "@bernouy/cms-source-images/sharp";
import type { SourceEndpointInterceptor, SourceRepository } from "@bernouy/cms-sources";

export type RuntimeSourceImageWorkers = Readonly<{
    scheduler: SourceImageJobQueue;
    coordinator: SourceImageMediaCoordinator;
    effects: SourceEndpointInterceptor;
    stop(): Promise<void>;
}>;

export function createRuntimeSourceImageWorkers(options: {
    scope: string;
    cache: SourceImageCache;
    queue: SourceImageJobQueue;
    index: SourceMediaIndex;
    sources: SourceRepository;
    reportError?: (error: unknown) => void;
}): RuntimeSourceImageWorkers {
    const coordinatorTransformer = new SharpSourceImageTransformer();
    const coordinator = new DefaultSourceImageMediaCoordinator({
        scope: options.scope,
        index: options.index,
        scheduler: options.queue,
        cache: options.cache,
        recipe: SOURCE_RESPONSIVE_WEBP_V1,
        encoderIdentity: coordinatorTransformer.encoderIdentity,
        resolveEndpoint: (sourceId, endpointId) => options.sources.getEndpoint(`urn:${sourceId}:${endpointId}`),
    });
    const createWorker = () =>
        new SourceImageJobWorker({
            allowedSourceOrigins: [new URL(options.scope).origin],
            cache: options.cache,
            transformer: new SharpSourceImageTransformer(),
            isAssetCurrent: ({ key, generation }) => options.index.isCurrent(key, generation),
        });
    const shared = {
        mediaIndex: options.index,
        cache: options.cache,
        onError: options.reportError,
        pollMs: 1_000,
        maxIdlePollMs: 5_000,
    };
    const critical = new SourceImageJobRunner(options.queue, createWorker(), {
        ...shared,
        priorities: ["media-critical"],
        concurrency: 1,
    });
    const cache = new SourceImageJobRunner(options.queue, createWorker(), {
        ...shared,
        priorities: ["media-cache"],
        concurrency: 1,
    });
    critical.start();
    cache.start();
    return {
        scheduler: options.queue,
        coordinator,
        effects: createSourceMediaEffectInterceptor(coordinator, options.reportError),
        async stop() {
            await Promise.all([critical.stop(), cache.stop()]);
        },
    };
}
