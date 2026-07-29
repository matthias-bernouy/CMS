import type {
    SourceImageJob,
    SourceImageJobClaim,
    SourceImageJobClaimRequest,
    SourceImageJobEnqueueResult,
    SourceImageJobQueue,
    SourceImageJobRetry,
} from "../../interfaces/jobs";

type Entry = {
    job: SourceImageJob;
    sequence: number;
    availableAt: number;
    attempts: number;
    token?: string;
    owner?: string;
    leaseUntil?: number;
};

export class InMemorySourceImageJobQueue implements SourceImageJobQueue {
    private readonly entries = new Map<string, Entry>();
    private readonly waiters = new Set<() => void>();
    private sequence = 0;

    async enqueue(job: SourceImageJob): Promise<SourceImageJobEnqueueResult> {
        if (this.entries.has(job.deduplicationKey)) {
            return "duplicate";
        }
        this.entries.set(job.deduplicationKey, {
            job: structuredClone(job),
            sequence: this.sequence++,
            availableAt: Date.now(),
            attempts: 0,
        });
        this.wake();
        return "accepted";
    }

    async claim(request: SourceImageJobClaimRequest): Promise<SourceImageJobClaim | null> {
        const eligible = [...this.entries.values()]
            .filter(
                (entry) =>
                    request.priorities.includes(entry.job.priority) &&
                    entry.availableAt <= request.now &&
                    (!entry.token || (entry.leaseUntil ?? 0) <= request.now),
            )
            .sort(
                (left, right) =>
                    request.priorities.indexOf(left.job.priority) - request.priorities.indexOf(right.job.priority) ||
                    left.sequence - right.sequence,
            )[0];
        if (!eligible) {
            return null;
        }
        eligible.token = crypto.randomUUID();
        eligible.owner = request.owner;
        eligible.leaseUntil = request.now + request.leaseMs;
        eligible.attempts += 1;
        return {
            job: structuredClone(eligible.job),
            token: eligible.token,
            owner: request.owner,
            attempts: eligible.attempts,
        };
    }

    async renew(claim: { token: string; owner: string; now: number; leaseMs: number }): Promise<boolean> {
        const entry = this.claimed(claim);
        if (!entry) {
            return false;
        }
        entry.leaseUntil = claim.now + claim.leaseMs;
        return true;
    }

    async complete(claim: Pick<SourceImageJobClaim, "token" | "owner">): Promise<boolean> {
        const entry = this.claimed(claim);
        return entry ? this.entries.delete(entry.job.deduplicationKey) : false;
    }

    async retry(retry: SourceImageJobRetry): Promise<boolean> {
        const entry = this.claimed(retry);
        if (!entry) {
            return false;
        }
        entry.availableAt = retry.availableAt;
        delete entry.token;
        delete entry.owner;
        delete entry.leaseUntil;
        this.wake();
        return true;
    }

    waitForAvailable(timeoutMs: number): Promise<void> {
        return new Promise((resolve) => {
            let timer: ReturnType<typeof setTimeout> | undefined;
            const done = () => {
                if (timer) {
                    clearTimeout(timer);
                }
                this.waiters.delete(done);
                resolve();
            };
            this.waiters.add(done);
            timer = setTimeout(done, timeoutMs);
        });
    }

    private claimed(claim: { token: string; owner: string }): Entry | undefined {
        return [...this.entries.values()].find((entry) => entry.token === claim.token && entry.owner === claim.owner);
    }

    private wake(): void {
        for (const waiter of [...this.waiters]) {
            waiter();
        }
    }
}
