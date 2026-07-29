import type { Collection, Db, OptionalUnlessRequiredId } from "mongodb";
import type {
    SourceImageJob,
    SourceImageJobClaim,
    SourceImageJobClaimRequest,
    SourceImageJobEnqueueResult,
    SourceImageJobQueue,
    SourceImageJobRetry,
} from "../../interfaces/jobs";

type JobDocument = {
    _id: string;
    job: SourceImageJob;
    priorityRank: number;
    availableAt: number;
    createdAt: number;
    attempts: number;
    token?: string;
    owner?: string;
    leaseUntil?: number;
    lastError?: string;
};

export class MongoSourceImageJobQueue implements SourceImageJobQueue {
    private readonly collection: Collection<JobDocument>;
    private readonly waiters = new Set<() => void>();

    constructor(db: Db, options: { collectionPrefix?: string } = {}) {
        this.collection = db.collection(`${options.collectionPrefix ?? ""}source_image_jobs`);
    }

    async init(): Promise<void> {
        await this.collection.createIndex({ priorityRank: 1, availableAt: 1, leaseUntil: 1, createdAt: 1 });
    }

    async enqueue(job: SourceImageJob): Promise<SourceImageJobEnqueueResult> {
        const now = Date.now();
        const document: JobDocument = {
            _id: job.deduplicationKey,
            job: structuredClone(job),
            priorityRank: job.priority === "media-critical" ? 0 : 1,
            availableAt: now,
            createdAt: now,
            attempts: 0,
        };
        try {
            await this.collection.insertOne(document as OptionalUnlessRequiredId<JobDocument>);
            this.wake();
            return "accepted";
        } catch (error) {
            if (isDuplicateKey(error)) {
                return "duplicate";
            }
            throw error;
        }
    }

    async claim(request: SourceImageJobClaimRequest): Promise<SourceImageJobClaim | null> {
        const token = crypto.randomUUID();
        const priorities = request.priorities.map((priority) => (priority === "media-critical" ? 0 : 1));
        const document = await this.collection.findOneAndUpdate(
            {
                priorityRank: { $in: priorities },
                availableAt: { $lte: request.now },
                $or: [{ token: { $exists: false } }, { leaseUntil: { $lte: request.now } }],
            },
            {
                $set: { token, owner: request.owner, leaseUntil: request.now + request.leaseMs },
                $inc: { attempts: 1 },
            },
            { sort: { priorityRank: 1, availableAt: 1, createdAt: 1, _id: 1 }, returnDocument: "after" },
        );
        return document
            ? {
                  job: structuredClone(document.job),
                  token,
                  owner: request.owner,
                  attempts: document.attempts,
              }
            : null;
    }

    async renew(claim: { token: string; owner: string; now: number; leaseMs: number }): Promise<boolean> {
        const result = await this.collection.updateOne(
            { token: claim.token, owner: claim.owner },
            { $set: { leaseUntil: claim.now + claim.leaseMs } },
        );
        return result.matchedCount === 1;
    }

    async complete(claim: Pick<SourceImageJobClaim, "token" | "owner">): Promise<boolean> {
        const result = await this.collection.deleteOne({ token: claim.token, owner: claim.owner });
        return result.deletedCount === 1;
    }

    async retry(retry: SourceImageJobRetry): Promise<boolean> {
        const result = await this.collection.updateOne(
            { token: retry.token, owner: retry.owner },
            {
                $set: { availableAt: retry.availableAt, lastError: retry.reason },
                $unset: { token: "", owner: "", leaseUntil: "" },
            },
        );
        if (result.matchedCount === 1) {
            this.wake();
            return true;
        }
        return false;
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

    private wake(): void {
        for (const waiter of [...this.waiters]) {
            waiter();
        }
    }
}

function isDuplicateKey(error: unknown): boolean {
    return !!error && typeof error === "object" && (error as { code?: number }).code === 11000;
}
