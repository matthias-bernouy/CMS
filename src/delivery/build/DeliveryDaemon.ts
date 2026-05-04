import type { DeliveryBuilder, RunOnceResult } from "src/delivery/build/DeliveryBuilder";

export type DeliveryDaemonOptions = {
    builder: DeliveryBuilder;
    /** Polling interval in milliseconds. */
    intervalMs: number;
    /** Called after every successful `runOnce`. Receives the result so
     *  the consumer can log / report metrics. */
    onResult?: (result: RunOnceResult) => void;
    /** Called when `runOnce` throws. Default: `console.error`. */
    onError?: (err: unknown) => void;
};

/**
 * Wraps `DeliveryBuilder` in a polling loop. One in-flight cycle at a time
 * — if a tick fires while the previous `runOnce` is still running, it's
 * skipped silently. `stop()` resolves once the in-flight cycle (if any)
 * has completed, so callers can safely tear down the CDN connections
 * after stopping.
 *
 * Distributed locking and queue semantics are out of scope here: this is
 * a single-process polling loop, swap it for a queue-backed driver if
 * multiple replicas need to coordinate.
 */
export class DeliveryDaemon {
    private _timer: ReturnType<typeof setInterval> | null = null;
    private _inFlight: Promise<void> | null = null;
    private _stopRequested = false;

    constructor(private _opts: DeliveryDaemonOptions) {}

    start(): void {
        if (this._timer) return;
        this._stopRequested = false;
        this._timer = setInterval(() => { void this._tick(); }, this._opts.intervalMs);
    }

    async stop(): Promise<void> {
        this._stopRequested = true;
        if (this._timer) {
            clearInterval(this._timer);
            this._timer = null;
        }
        if (this._inFlight) await this._inFlight;
    }

    private async _tick(): Promise<void> {
        if (this._inFlight || this._stopRequested) return;
        this._inFlight = this._runOnce().finally(() => { this._inFlight = null; });
        await this._inFlight;
    }

    private async _runOnce(): Promise<void> {
        try {
            const result = await this._opts.builder.runOnce();
            this._opts.onResult?.(result);
        } catch (err) {
            (this._opts.onError ?? defaultLog)(err);
        }
    }
}

function defaultLog(err: unknown): void {
    console.error("[DeliveryDaemon] runOnce failed:", err);
}
