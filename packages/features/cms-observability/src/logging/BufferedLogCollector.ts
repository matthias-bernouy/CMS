import type { Logger } from "@bernouy/logging";
import type { LogEntry } from "cms-observability/interfaces/Journal";
import { LogDeliveryError } from "./LogDeliveryError";
import { withoutLogCollection } from "./collectionContext";

type Destination = (entries: readonly LogEntry[]) => Promise<void>;

/** Bounded, single-flight, best-effort delivery. Persistence starts at the receiving acknowledgement. */
export class BufferedLogCollector {
    readonly #queue: { entry: LogEntry; bytes: number }[] = [];
    #bytes = 0;
    #dropped = 0;
    #destination?: Destination;
    #timer?: ReturnType<typeof setInterval>;
    #flight?: Promise<void>;
    #retryAt = 0;
    #failures = 0;
    #closed = false;

    constructor(
        private readonly fallback: Logger,
        private readonly options: { maxEntries?: number; maxBytes?: number; now?: () => number } = {},
    ) {
        for (const value of [options.maxEntries ?? 2000, options.maxBytes ?? 2 * 1024 * 1024]) {
            if (!Number.isSafeInteger(value) || value < 1) {
                throw new TypeError("Collector limits must be positive integers");
            }
        }
    }

    enqueue(entry: LogEntry): void {
        const snapshot = structuredClone(entry);
        const bytes = Buffer.byteLength(JSON.stringify(snapshot));
        if (
            this.#closed ||
            this.#queue.length >= (this.options.maxEntries ?? 2000) ||
            this.#bytes + bytes > (this.options.maxBytes ?? 2 * 1024 * 1024)
        ) {
            this.#dropped += 1;
            return;
        }
        this.#queue.push({ entry: snapshot, bytes });
        this.#bytes += bytes;
    }

    connect(destination: Destination): void {
        if (this.#closed || this.#destination) {
            throw new Error("Collector destination is already configured or closed");
        }
        this.#destination = destination;
        this.#timer = setInterval(() => {
            void this.flush();
        }, 1000);
        this.#timer.unref();
    }

    stats() {
        return { queued: this.#queue.length, bytes: this.#bytes, dropped: this.#dropped, failures: this.#failures };
    }

    async flush(): Promise<void> {
        if (this.#flight) {
            return this.#flight;
        }
        if (!this.#destination || this.#queue.length === 0 || this.now() < this.#retryAt) {
            return;
        }
        const batch: { entry: LogEntry; bytes: number }[] = [];
        let bytes = 0;
        for (const item of this.#queue) {
            if (batch.length >= 50 || (batch.length > 0 && bytes + item.bytes > 256 * 1024)) {
                break;
            }
            batch.push(item);
            bytes += item.bytes;
        }
        this.#flight = withoutLogCollection(async () => {
            try {
                await this.#destination!(batch.map(({ entry }) => entry));
                this.#queue.splice(0, batch.length);
                this.#bytes -= bytes;
                this.#failures = 0;
                this.#retryAt = 0;
            } catch (error) {
                if (error instanceof LogDeliveryError && !error.retryable) {
                    this.#queue.splice(0, batch.length);
                    this.#bytes -= bytes;
                    this.#dropped += batch.length;
                    this.fallback.warn("observability.delivery.rejected", this.stats());
                    return;
                }
                this.#failures += 1;
                this.#retryAt =
                    this.now() +
                    Math.min(30_000, 500 * 2 ** Math.min(this.#failures, 6)) +
                    Math.floor(Math.random() * 250);
                if (this.#failures === 1) {
                    this.fallback.warn("observability.delivery.unavailable", this.stats());
                }
            }
        }).finally(() => {
            this.#flight = undefined;
        });
        return this.#flight;
    }

    async close(timeoutMs = 2000): Promise<void> {
        if (this.#timer) {
            clearInterval(this.#timer);
        }
        const deadline = Date.now() + timeoutMs;
        const drain = async () => {
            while (this.#queue.length && this.#destination && Date.now() < deadline) {
                const before = this.#queue.length;
                await this.flush();
                if (this.#queue.length >= before) {
                    break;
                }
            }
        };
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            await Promise.race([
                drain(),
                new Promise<void>((resolve) => {
                    timer = setTimeout(resolve, timeoutMs);
                }),
            ]);
        } finally {
            if (timer) {
                clearTimeout(timer);
            }
            this.#closed = true;
            if (this.#queue.length || this.#dropped) {
                this.fallback.warn("observability.delivery.incomplete", this.stats());
            }
        }
    }

    private now(): number {
        return this.options.now?.() ?? Date.now();
    }
}
