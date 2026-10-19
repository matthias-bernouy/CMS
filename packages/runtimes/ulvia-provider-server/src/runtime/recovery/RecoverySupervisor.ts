import { runWithoutRequestContext } from "@bernouy/http-runner/observability";

const DEFAULT_INTERVAL_MS = 10_000;
const DEFAULT_BATCH_SIZE = 100;

export class RecoverySupervisor {
    #timer?: ReturnType<typeof setInterval>;
    #running?: Promise<void>;

    constructor(
        private readonly recoverBatch: (limit: number) => Promise<number>,
        private readonly intervalMs = DEFAULT_INTERVAL_MS,
        private readonly batchSize = DEFAULT_BATCH_SIZE,
        private readonly reportError: (error: unknown) => void = () => undefined,
    ) {
        if (!Number.isSafeInteger(intervalMs) || intervalMs < 1) {
            throw new TypeError("Recovery interval must be a positive safe integer");
        }
        if (!Number.isSafeInteger(batchSize) || batchSize < 1) {
            throw new TypeError("Recovery batch size must be a positive safe integer");
        }
    }

    async start(waitForInitial = true): Promise<void> {
        if (this.#timer) {
            return;
        }
        const initial = runWithoutRequestContext(() => this.#trigger());
        this.#timer = runWithoutRequestContext(() =>
            setInterval(() => void this.#trigger().catch(this.reportError), this.intervalMs),
        );
        this.#timer.unref?.();
        if (waitForInitial) {
            await initial;
        } else {
            void initial.catch(this.reportError);
        }
    }

    async stop(): Promise<void> {
        if (this.#timer) {
            clearInterval(this.#timer);
            this.#timer = undefined;
        }
        await this.#running;
    }

    #trigger(): Promise<void> {
        if (this.#running) {
            return this.#running;
        }
        const running = this.#drain().finally(() => {
            if (this.#running === running) {
                this.#running = undefined;
            }
        });
        this.#running = running;
        return running;
    }

    async #drain(): Promise<void> {
        while ((await this.recoverBatch(this.batchSize)) === this.batchSize) {
            // Continue until the durable queue contains fewer than one full batch.
        }
    }
}
