/**
 * Tiny in-process job queue for background image optimization. The renderer
 * serves the page with originals immediately and enqueues a job; the worker
 * generates variants off the request path, then invalidates the page (next
 * render emits the `srcset`).
 *
 * - **Dedupe by key**: a page already queued or in-flight is ignored, so a burst
 *   of requests for the same cold page schedules one job.
 * - **Bounded concurrency**: caps how many jobs (and thus sharp encodes) run at
 *   once, so optimization never starves request serving.
 *
 * Lives in the Delivery process (V1). It is intentionally not durable: on
 * restart the queue is empty and the next request re-enqueues — idempotent,
 * because generation is content-addressed (`ensureVariants` skips done work).
 */
export class OptimizeQueue {

    private readonly inFlight = new Set<string>();
    private readonly waiting: { key: string; run: () => Promise<void> }[] = [];
    private active = 0;

    constructor(private readonly concurrency: number = 2) {}

    /** Schedule `run` under a dedupe `key`. A key already waiting or running is
     *  a no-op. Fire-and-forget — never throws to the caller. */
    enqueue(key: string, run: () => Promise<void>): void {
        if (this.inFlight.has(key) || this.waiting.some((w) => w.key === key)) return;
        this.waiting.push({ key, run });
        this._drain();
    }

    private _drain(): void {
        while (this.active < this.concurrency && this.waiting.length > 0) {
            const job = this.waiting.shift()!;
            this.inFlight.add(job.key);
            this.active++;
            void job.run()
                .catch(() => { /* best-effort; a failed job re-enqueues on the next render */ })
                .finally(() => {
                    this.inFlight.delete(job.key);
                    this.active--;
                    this._drain();
                });
        }
    }

    /** True while any job is waiting or running. */
    get busy(): boolean { return this.active > 0 || this.waiting.length > 0; }
}
