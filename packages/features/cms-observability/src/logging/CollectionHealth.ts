import type { Logger } from "@bernouy/logging";
import { withoutLogCollection } from "./collectionContext";

/** Rate-limit summaries independently of delivery and never collect the summaries themselves. */
export class CollectionHealth {
    private reportedDrops = 0;
    private reportedAt = Number.NEGATIVE_INFINITY;

    constructor(
        private readonly fallback: Logger,
        private readonly now: () => number,
    ) {}

    report(stats: { dropped: number; queued: number; bytes: number }, force = false): void {
        const lost = stats.dropped - this.reportedDrops;
        const now = this.now();
        if (lost === 0 || (!force && now - this.reportedAt < 10_000)) {
            return;
        }
        this.reportedDrops = stats.dropped;
        this.reportedAt = now;
        withoutLogCollection(() => this.fallback.warn("observability.delivery.dropped", { ...stats, lost }));
    }
}
