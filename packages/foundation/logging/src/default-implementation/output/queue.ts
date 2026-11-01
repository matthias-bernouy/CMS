export type OutputEntry = Readonly<{
    line: string;
    bytes: number;
    target: "stdout" | "stderr";
    priority: number;
}>;

/** One process-wide budget; higher priorities can replace older lower-priority entries. */
export class OutputQueue {
    private readonly entries: OutputEntry[] = [];
    private bytes = 0;
    private dropped = 0;
    private criticalDropped = 0;

    constructor(
        readonly maxEntries = 1000,
        readonly maxBytes = 1024 * 1024,
    ) {
        if (![maxEntries, maxBytes].every((value) => Number.isSafeInteger(value) && value > 0)) {
            throw new TypeError("Operator output limits must be positive integers");
        }
    }

    stats() {
        return {
            queued: this.entries.length,
            bytes: this.bytes,
            dropped: this.dropped,
            criticalDropped: this.criticalDropped,
        };
    }

    drop(entry: OutputEntry): void {
        this.dropped += 1;
        if (entry.priority > 0) {
            this.criticalDropped += 1;
        }
    }

    push(entry: OutputEntry): void {
        if (entry.bytes > this.maxBytes) {
            this.drop(entry);
            return;
        }
        while (this.entries.length >= this.maxEntries || this.bytes + entry.bytes > this.maxBytes) {
            const index = this.entries.findIndex((previous) => previous.priority < entry.priority);
            if (index < 0) {
                this.drop(entry);
                return;
            }
            this.drop(this.remove(index));
        }
        this.entries.push(entry);
        this.bytes += entry.bytes;
    }

    take(available: (target: OutputEntry["target"]) => boolean): OutputEntry | undefined {
        const index = this.entries.findIndex((entry) => available(entry.target));
        return index < 0 ? undefined : this.remove(index);
    }

    discard(target: OutputEntry["target"]): void {
        for (let index = this.entries.length - 1; index >= 0; index--) {
            if (this.entries[index]!.target === target) {
                this.drop(this.remove(index));
            }
        }
    }

    private remove(index: number): OutputEntry {
        const [entry] = this.entries.splice(index, 1);
        this.bytes -= entry!.bytes;
        return entry!;
    }
}
