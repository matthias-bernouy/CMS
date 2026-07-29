import type { SourceImageCache } from "../../interfaces/cache";
import type {
    SourceImageJobClaim,
    SourceImageJobHandler,
    SourceImageJobPriority,
    SourceImageJobQueue,
    SourceImageJobResult,
} from "../../interfaces/jobs";
import type { SourceMediaIndex } from "../../interfaces/media";

export type SourceImageJobRunnerOptions = Readonly<{
    priorities: readonly SourceImageJobPriority[];
    concurrency?: number;
    owner?: string;
    leaseMs?: number;
    pollMs?: number;
    maxIdlePollMs?: number;
    maxAttempts?: number;
    clock?: () => number;
    random?: () => number;
    mediaIndex?: SourceMediaIndex;
    cache?: SourceImageCache;
    onError?: (error: unknown) => void;
}>;

export class SourceImageJobRunner {
    private readonly owner;
    private readonly leaseMs;
    private readonly now;
    private readonly random;
    private running = false;
    private loops: Promise<void>[] = [];

    constructor(
        private readonly queue: SourceImageJobQueue,
        private readonly handler: SourceImageJobHandler,
        private readonly options: SourceImageJobRunnerOptions,
    ) {
        if (!options.priorities.length) {
            throw new TypeError("source image job runner requires at least one priority");
        }
        this.owner = options.owner ?? `source-image-worker:${crypto.randomUUID()}`;
        this.leaseMs = positiveInteger(options.leaseMs ?? 60_000, "leaseMs");
        this.now = options.clock ?? Date.now;
        this.random = options.random ?? Math.random;
    }

    start(): void {
        if (this.running) {
            return;
        }
        this.running = true;
        const concurrency = positiveInteger(this.options.concurrency ?? 1, "concurrency");
        this.loops = Array.from({ length: concurrency }, () => this.loop());
    }

    async stop(): Promise<void> {
        this.running = false;
        await Promise.all(this.loops);
        this.loops = [];
    }

    private async loop(): Promise<void> {
        const pollMs = positiveInteger(this.options.pollMs ?? 1_000, "pollMs");
        const maxPollMs = Math.max(pollMs, positiveInteger(this.options.maxIdlePollMs ?? 5_000, "maxIdlePollMs"));
        let idleMs = pollMs;
        while (this.running) {
            try {
                const claim = await this.queue.claim({
                    owner: this.owner,
                    now: this.now(),
                    leaseMs: this.leaseMs,
                    priorities: this.options.priorities,
                });
                if (claim) {
                    idleMs = pollMs;
                    await this.handle(claim);
                    continue;
                }
            } catch (error) {
                this.options.onError?.(error);
            }
            await this.wait(Math.round(idleMs * (0.9 + this.random() * 0.2)));
            idleMs = Math.min(maxPollMs, Math.ceil(idleMs * 1.5));
        }
    }

    private async handle(claim: SourceImageJobClaim): Promise<void> {
        const asset = claim.job.asset;
        if (asset && this.options.mediaIndex) {
            if (!(await this.options.mediaIndex.markProcessing(asset.key, asset.generation, this.now()))) {
                await this.queue.complete(claim);
                return;
            }
        }
        const heartbeat = setInterval(
            () => {
                void this.queue
                    .renew({ token: claim.token, owner: claim.owner, now: this.now(), leaseMs: this.leaseMs })
                    .catch((error) => this.options.onError?.(error));
            },
            Math.max(100, Math.floor(this.leaseMs / 3)),
        );
        try {
            await this.settle(claim, await this.handler.handle(claim.job));
        } catch (error) {
            this.options.onError?.(error);
            await this.retry(claim, "processing_failed");
        } finally {
            clearInterval(heartbeat);
        }
    }

    private async settle(claim: SourceImageJobClaim, result: SourceImageJobResult): Promise<void> {
        const asset = claim.job.asset;
        if (result.disposition === "completed") {
            if (asset && result.variants) {
                const current = await this.options.mediaIndex?.markReady(
                    asset.key,
                    asset.generation,
                    result.variants,
                    this.now(),
                );
                if (current) {
                    await this.collectObsolete(asset.key, asset.generation);
                }
            }
            await this.queue.complete(claim);
            return;
        }
        if (result.disposition === "retry" && claim.attempts < (this.options.maxAttempts ?? 8)) {
            await this.retry(claim, result.reason);
            return;
        }
        if (asset) {
            await this.options.mediaIndex?.markFailed(asset.key, asset.generation, result.reason, this.now());
        }
        await this.queue.complete(claim);
    }

    private async retry(claim: SourceImageJobClaim, reason: string): Promise<void> {
        const base = Math.min(300_000, 1_000 * 2 ** Math.min(8, Math.max(0, claim.attempts - 1)));
        const availableAt = this.now() + Math.round(base * (0.8 + this.random() * 0.4));
        await this.queue.retry({ token: claim.token, owner: claim.owner, availableAt, reason });
    }

    private async collectObsolete(key: string, generation: string): Promise<void> {
        if (!this.options.cache || !this.options.mediaIndex) {
            return;
        }
        const keys = await this.options.mediaIndex.takeObsoleteDerivativeKeys(key, generation);
        await Promise.all(keys.map((item) => this.options.cache!.deleteDerivative(item).catch(() => undefined)));
    }

    private async wait(timeoutMs: number): Promise<void> {
        if (this.queue.waitForAvailable) {
            await this.queue.waitForAvailable(timeoutMs);
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, timeoutMs));
    }
}

function positiveInteger(value: number, name: string): number {
    if (!Number.isSafeInteger(value) || value < 1) {
        throw new TypeError(`source image job runner ${name} must be a positive integer`);
    }
    return value;
}
