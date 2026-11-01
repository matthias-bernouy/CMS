import type { Writable } from "node:stream";
import type { LogLevel } from "logging/interfaces/Logger";
import { OutputQueue } from "./queue";
import type { OutputEntry } from "./queue";

type Destination = { stream: Writable; blocked: boolean; closed: boolean };

/** Respect each destination's backpressure without making application logging asynchronous. */
export class NodeLogOutput {
    private readonly queue: OutputQueue;
    private readonly targets: Record<OutputEntry["target"], Destination>;
    private timer?: ReturnType<typeof setTimeout>;
    private reportedDrops = 0;
    private reportedAt = Number.NEGATIVE_INFINITY;
    private destinationFailures = 0;

    constructor(stdout: Writable, stderr: Writable, limits: { maxEntries?: number; maxBytes?: number } = {}) {
        this.queue = new OutputQueue(limits.maxEntries, limits.maxBytes);
        this.targets = {
            stdout: { stream: stdout, blocked: false, closed: stdout.destroyed || stdout.writableEnded },
            stderr: { stream: stderr, blocked: false, closed: stderr.destroyed || stderr.writableEnded },
        };
        for (const name of ["stdout", "stderr"] as const) {
            const target = this.targets[name];
            const close = () => {
                if (!target.closed) {
                    this.destinationFailures += 1;
                    target.closed = true;
                    target.blocked = false;
                    this.queue.discard(name);
                    this.scheduleReport();
                }
            };
            target.stream.on("error", close);
            target.stream.once("close", close);
        }
    }

    stats() {
        return {
            ...this.queue.stats(),
            blocked: Object.values(this.targets).filter((target) => target.blocked).length,
            unavailable: Object.values(this.targets).filter((target) => target.closed).length,
            destinationFailures: this.destinationFailures,
        };
    }

    write(line: string, level: LogLevel): void {
        const entry: OutputEntry = {
            line,
            bytes: Buffer.byteLength(line),
            target: level === "error" || level === "fatal" ? "stderr" : "stdout",
            priority: level === "fatal" ? 2 : level === "error" ? 1 : 0,
        };
        const target = this.targets[entry.target];
        if (target.closed || entry.bytes > this.queue.maxBytes) {
            this.queue.drop(entry);
        } else if (!target.blocked) {
            this.send(entry);
        } else {
            this.queue.push(entry);
            this.pump();
        }
        this.scheduleReport();
    }

    private send(entry: OutputEntry, countFailure = true): boolean {
        const target = this.targets[entry.target];
        try {
            if (!target.stream.write(entry.line)) {
                target.blocked = true;
                target.stream.once("drain", () => {
                    target.blocked = false;
                    this.pump();
                    this.report();
                });
            }
            return true;
        } catch {
            if (countFailure) {
                this.destinationFailures += 1;
                this.queue.drop(entry);
            }
            return false;
        }
    }

    private pump(): void {
        let entry: OutputEntry | undefined;
        while ((entry = this.queue.take((name) => !this.targets[name].blocked && !this.targets[name].closed))) {
            this.send(entry);
        }
    }

    private scheduleReport(): void {
        if (this.timer || this.queue.stats().dropped === this.reportedDrops) {
            return;
        }
        this.timer = setTimeout(() => {
            this.timer = undefined;
            this.report();
        }, 1000);
        this.timer.unref();
    }

    private report(): void {
        const stats = this.stats();
        const lost = stats.dropped - this.reportedDrops;
        if (lost === 0) {
            return;
        }
        const target = (["stderr", "stdout"] as const).find(
            (name) => !this.targets[name].blocked && !this.targets[name].closed,
        );
        if (target && Date.now() - this.reportedAt >= 1000) {
            const line =
                JSON.stringify({
                    time: new Date().toISOString(),
                    level: "warn",
                    service: "logging",
                    event: "logging.output.dropped",
                    attributes: { ...stats, lost },
                }) + "\n";
            if (this.send({ line, target, bytes: Buffer.byteLength(line), priority: 0 }, false)) {
                this.reportedDrops = stats.dropped;
                this.reportedAt = Date.now();
            }
        }
        this.scheduleReport();
    }
}
