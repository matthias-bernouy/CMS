import type {
    SourceImageJob,
    SourceImageJobEnqueueResult,
    SourceImageJobHandler,
    SourceImageJobResult,
    SourceImageJobScheduler,
} from "../../interfaces/jobs";

export type InProcessSourceImageJobSchedulerOptions = Readonly<{
    concurrency?: number;
    maxQueue?: number;
    onResult?: (job: SourceImageJob, result: SourceImageJobResult) => void | Promise<void>;
    onError?: (job: SourceImageJob, error: unknown) => void | Promise<void>;
}>;

export class InProcessSourceImageJobScheduler implements SourceImageJobScheduler {
    private readonly concurrency: number;
    private readonly maxQueue: number;
    private readonly queued: SourceImageJob[] = [];
    private readonly keys = new Set<string>();
    private active = 0;
    private drainScheduled = false;

    constructor(
        private readonly handler: SourceImageJobHandler,
        private readonly options: InProcessSourceImageJobSchedulerOptions = {},
    ) {
        this.concurrency = positiveInteger(options.concurrency ?? 1, "concurrency");
        this.maxQueue = nonNegativeInteger(options.maxQueue ?? 32, "maxQueue");
    }

    async enqueue(job: SourceImageJob): Promise<SourceImageJobEnqueueResult> {
        if (this.keys.has(job.deduplicationKey)) {
            return "duplicate";
        }
        if (this.queued.length >= this.maxQueue) {
            return "saturated";
        }
        const copy = structuredClone(job);
        this.keys.add(copy.deduplicationKey);
        this.queued.push(copy);
        this.scheduleDrain();
        return "accepted";
    }

    get activeCount(): number {
        return this.active;
    }

    get queuedCount(): number {
        return this.queued.length;
    }

    private scheduleDrain(): void {
        if (this.drainScheduled) {
            return;
        }
        this.drainScheduled = true;
        queueMicrotask(() => {
            this.drainScheduled = false;
            this.drain();
        });
    }

    private drain(): void {
        while (this.active < this.concurrency) {
            const job = this.queued.shift();
            if (!job) {
                return;
            }
            this.active += 1;
            void this.run(job);
        }
    }

    private async run(job: SourceImageJob): Promise<void> {
        try {
            const result = await this.handler.handle(job);
            await this.options.onResult?.(job, result);
        } catch (error) {
            await this.options.onError?.(job, error);
        } finally {
            this.active -= 1;
            this.keys.delete(job.deduplicationKey);
            this.scheduleDrain();
        }
    }
}

function positiveInteger(value: number, name: string): number {
    if (!Number.isSafeInteger(value) || value < 1) {
        throw new TypeError(`source image job ${name} must be a positive integer`);
    }
    return value;
}

function nonNegativeInteger(value: number, name: string): number {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new TypeError(`source image job ${name} must be a non-negative integer`);
    }
    return value;
}
