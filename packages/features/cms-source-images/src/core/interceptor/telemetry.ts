import { measureActiveSourceTiming, type SourceTimingStage } from "@bernouy/cms-sources";
import type {
    SourceImageObservation,
    SourceImageObserver,
    SourceImageOutcome,
    SourceImageReason,
    SourceImageStage,
} from "../../interfaces/observability";

const CMS_STAGE: Record<SourceImageStage, SourceTimingStage> = {
    upstream: "cms_image_upstream",
    read: "cms_image_read",
    decode: "cms_image_decode",
    semaphore_wait: "cms_image_semaphore_wait",
    encode: "cms_image_encode",
    store: "cms_image_store",
};

export class SourceImageRequestTelemetry {
    readonly stagesMs: Partial<Record<SourceImageStage, number>> = {};
    policy: "public" | "private" | undefined;
    width: number | undefined;
    cache: "hit" | "miss" | "stale" | undefined;
    joinedSingleFlight = false;
    evicted = 0;
    cacheErrors = 0;
    sourceBytes: number | undefined;
    outputBytes: number | undefined;
    private finished = false;

    constructor(
        private readonly request: Request,
        private readonly observe: SourceImageObserver | undefined,
        private readonly clock: () => number,
    ) {}

    async measure<T>(stage: SourceImageStage, operation: () => T | Promise<T>): Promise<T> {
        const started = this.clock();
        try {
            return await measureActiveSourceTiming(this.request, CMS_STAGE[stage], operation);
        } finally {
            const duration = Math.max(0, this.clock() - started);
            this.stagesMs[stage] = (this.stagesMs[stage] ?? 0) + duration;
        }
    }

    async finish(outcome: SourceImageOutcome, reason?: SourceImageReason): Promise<void> {
        if (this.finished) {
            return;
        }
        this.finished = true;
        const observation: SourceImageObservation = {
            outcome,
            ...(reason ? { reason } : {}),
            ...(this.policy ? { policy: this.policy } : {}),
            ...(this.width !== undefined ? { width: this.width } : {}),
            ...(this.cache ? { cache: this.cache } : {}),
            ...(this.joinedSingleFlight ? { joinedSingleFlight: true } : {}),
            ...(this.evicted > 0 ? { evicted: this.evicted } : {}),
            ...(this.cacheErrors > 0 ? { cacheErrors: this.cacheErrors } : {}),
            stagesMs: { ...this.stagesMs },
            ...(this.sourceBytes !== undefined ? { sourceBytes: this.sourceBytes } : {}),
            ...(this.outputBytes !== undefined ? { outputBytes: this.outputBytes } : {}),
            ...(this.sourceBytes && this.outputBytes !== undefined
                ? { compressionRatio: this.outputBytes / this.sourceBytes }
                : {}),
        };
        try {
            await this.observe?.(observation);
        } catch {
            // Telemetry never changes image delivery.
        }
    }
}
