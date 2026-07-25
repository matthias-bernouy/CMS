import {
    createDisabledSourceImageInterceptor,
    createSourceImageInterceptor,
    SOURCE_IMAGE_OUTCOMES,
    SOURCE_IMAGE_REASONS,
    SOURCE_IMAGE_STAGES,
    SourceImageSemaphore,
    type SourceImageCache,
    type SourceImageObservation,
    type SourceImageObserver,
} from "@bernouy/cms-source-images";
import type { SourceEndpointInterceptor } from "@bernouy/cms-sources";

type SourceImageTelemetryConfig = {
    sampleRate: number;
    report: (message: string) => void;
    random?: () => number;
};

const OUTCOMES = new Set<string>(SOURCE_IMAGE_OUTCOMES);
const REASONS = new Set<string>(SOURCE_IMAGE_REASONS);

export async function createRuntimeSourceImageInterceptor(config: {
    cache: SourceImageCache;
    scope: string;
    sampleRate: number;
    report: (message: string) => void;
    observe?: SourceImageObserver;
}): Promise<SourceEndpointInterceptor> {
    const { SharpSourceImageTransformer } = await import("@bernouy/cms-source-images/sharp");
    return createSourceImageInterceptor({
        cache: config.cache,
        transformer: new SharpSourceImageTransformer(),
        semaphore: new SourceImageSemaphore(1),
        semaphoreWaitTimeoutMs: 5_000,
        scope: config.scope,
        observe: config.observe ?? createSourceImageTelemetryObserver(config),
    });
}

export async function createRuntimeSourceImageComposition(config: {
    cache: SourceImageCache | null;
    transformsEnabled: boolean;
    responsivePublicMarkupEnabled: boolean;
    responsivePrivateMarkupEnabled: boolean;
    scope: string;
    sampleRate: number;
    report: (message: string) => void;
}): Promise<{
    sourceImageInterceptor: SourceEndpointInterceptor;
    responsivePublicSourceImagesEnabled: boolean;
    responsivePrivateSourceImagesEnabled: boolean;
}> {
    const observe = createSourceImageTelemetryObserver(config);
    if (!config.transformsEnabled) {
        return {
            sourceImageInterceptor: createDisabledSourceImageInterceptor(observe),
            responsivePublicSourceImagesEnabled: false,
            responsivePrivateSourceImagesEnabled: false,
        };
    }
    if (!config.cache) {
        throw new Error("Source image cache is unavailable while transforms are enabled");
    }
    return {
        sourceImageInterceptor: await createRuntimeSourceImageInterceptor({
            cache: config.cache,
            scope: config.scope,
            sampleRate: config.sampleRate,
            report: config.report,
            observe,
        }),
        responsivePublicSourceImagesEnabled: config.responsivePublicMarkupEnabled,
        responsivePrivateSourceImagesEnabled: config.responsivePrivateMarkupEnabled,
    };
}

export function createSourceImageTelemetryObserver(config: SourceImageTelemetryConfig): SourceImageObserver {
    const sampleRate = clampRate(config.sampleRate);
    const random = config.random ?? Math.random;
    return (observation) => {
        if (!mustReport(observation) && sampleRate < 1 && random() >= sampleRate) {
            return;
        }
        config.report(JSON.stringify(sourceImageDiagnosticLog(observation)));
    };
}

function mustReport(observation: SourceImageObservation): boolean {
    return (
        observation.outcome === "rejected" ||
        observation.outcome === "upstream_response" ||
        observation.outcome === "failed" ||
        observation.outcome === "fallback" ||
        (observation.evicted ?? 0) > 0 ||
        (observation.cacheErrors ?? 0) > 0
    );
}

function sourceImageDiagnosticLog(observation: SourceImageObservation): Record<string, unknown> {
    const stagesMs: Record<string, number> = {};
    for (const stage of SOURCE_IMAGE_STAGES) {
        const duration = observation.stagesMs[stage];
        if (validNumber(duration)) {
            stagesMs[stage] = duration;
        }
    }
    return {
        event: "cms_source_image",
        outcome: OUTCOMES.has(observation.outcome) ? observation.outcome : "failed",
        ...(observation.reason && REASONS.has(observation.reason) ? { reason: observation.reason } : {}),
        ...(observation.policy === "public" || observation.policy === "private" ? { policy: observation.policy } : {}),
        ...(validNumber(observation.width) ? { width: observation.width } : {}),
        ...(observation.cache === "hit" || observation.cache === "miss" || observation.cache === "stale"
            ? { cache: observation.cache }
            : {}),
        ...(typeof observation.joinedSingleFlight === "boolean"
            ? { joinedSingleFlight: observation.joinedSingleFlight }
            : {}),
        ...(validNumber(observation.evicted) ? { evicted: observation.evicted } : {}),
        ...(validNumber(observation.cacheErrors) ? { cacheErrors: observation.cacheErrors } : {}),
        stagesMs,
        ...(validNumber(observation.sourceBytes) ? { sourceBytes: observation.sourceBytes } : {}),
        ...(validNumber(observation.outputBytes) ? { outputBytes: observation.outputBytes } : {}),
        ...(validNumber(observation.compressionRatio) ? { compressionRatio: observation.compressionRatio } : {}),
    };
}

function clampRate(value: number): number {
    return Number.isFinite(value) ? Math.max(0, Math.min(value, 1)) : 0;
}

function validNumber(value: number | undefined): value is number {
    return value !== undefined && Number.isFinite(value) && value >= 0;
}
