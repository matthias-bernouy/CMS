import { runWithoutRequestContext } from "@bernouy/http-runner/observability";

type Preparation = (signal: AbortSignal) => Promise<void>;

/** One active job; repeated hints replace the pending job for the same instance. */
export class DocumentationPreparationQueue {
    private readonly pending = new Map<string, Preparation>();
    private readonly shutdown = new AbortController();
    private running?: Promise<void>;
    private activeKey?: string;
    constructor(
        private readonly report: (key: string, error: unknown) => void,
        private readonly limit = 32,
    ) {}

    request(key: string, prepare: Preparation): boolean {
        if (this.shutdown.signal.aborted || (!this.pending.has(key) && this.pending.size >= this.limit)) {
            return false;
        }
        this.pending.set(key, prepare);
        this.start();
        return true;
    }

    contains(key: string): boolean {
        return this.activeKey === key || this.pending.has(key);
    }

    private start(): void {
        if (!this.running) {
            this.running = runWithoutRequestContext(async () => {
                await new Promise<void>((resolve) => setImmediate(resolve));
                await this.drain();
            }).finally(() => {
                this.running = undefined;
                if (this.pending.size) {
                    this.start();
                }
            });
        }
    }

    async idle(): Promise<void> {
        while (this.running) {
            await this.running;
        }
    }

    async close(): Promise<void> {
        this.shutdown.abort();
        this.pending.clear();
        await this.idle();
    }

    private async drain(): Promise<void> {
        while (this.pending.size && !this.shutdown.signal.aborted) {
            const [key, prepare] = this.pending.entries().next().value!;
            this.pending.delete(key);
            this.activeKey = key;
            try {
                await prepare(this.shutdown.signal);
            } catch (error) {
                if (!this.shutdown.signal.aborted) {
                    try {
                        this.report(key, error);
                    } catch {
                        // A reporting failure cannot strand subsequent preparations.
                    }
                }
            } finally {
                this.activeKey = undefined;
            }
        }
    }
}
