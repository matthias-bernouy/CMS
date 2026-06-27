import { describe, expect, test } from "bun:test";
import { MongoRateLimiter } from "@bernouy/rate-limiter/mongo";
import type { Db } from "mongodb";

type WindowDoc = { _id: string; count: number; expiresAt: Date };

class FakeCollection {
    readonly updates: unknown[] = [];
    readonly indexes: unknown[] = [];
    private docs = new Map<string, WindowDoc>();

    seed(doc: WindowDoc): void {
        this.docs.set(doc._id, { ...doc });
    }

    get(key: string): WindowDoc | undefined {
        const doc = this.docs.get(key);
        return doc ? { ...doc } : undefined;
    }

    async createIndex(index: unknown, opts: unknown): Promise<void> {
        this.indexes.push({ index, opts });
    }

    async findOneAndUpdate(filter: { _id: string }, update: any): Promise<WindowDoc> {
        this.updates.push(update);
        const set = update[0].$set;
        const now = set.count.$cond[0].$gt[1] as Date;
        const nextExpiry = set.expiresAt.$cond[2] as Date;
        const current = this.docs.get(filter._id);
        const active = current ? current.expiresAt.getTime() > now.getTime() : false;
        const next: WindowDoc = active
            ? { _id: filter._id, count: current!.count + 1, expiresAt: current!.expiresAt }
            : { _id: filter._id, count: 1, expiresAt: nextExpiry };
        this.docs.set(filter._id, next);
        return { ...next };
    }

    async deleteOne(filter: { _id: string }): Promise<void> {
        this.docs.delete(filter._id);
    }
}

function setup(limit = 2) {
    const collection = new FakeCollection();
    const db = { collection: () => collection } as unknown as Db;
    const limiter = new MongoRateLimiter(db, { limit, windowSeconds: 60 });
    return { limiter, collection };
}

describe("MongoRateLimiter", () => {
    test("uses one atomic update pipeline per hit", async () => {
        const { limiter, collection } = setup();

        await limiter.hit("k");

        expect(collection.updates).toHaveLength(1);
        expect(Array.isArray(collection.updates[0])).toBe(true);
    });

    test("allows up to the limit, then blocks with retry metadata", async () => {
        const { limiter, collection } = setup(2);

        expect((await limiter.hit("k")).allowed).toBe(true);
        expect((await limiter.hit("k")).allowed).toBe(true);
        const blocked = await limiter.hit("k");

        expect(blocked.allowed).toBe(false);
        expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
        expect(collection.get("k")?.count).toBe(3);
    });

    test("expired windows reset to a fresh count", async () => {
        const { limiter, collection } = setup(1);
        collection.seed({ _id: "k", count: 9, expiresAt: new Date(Date.now() - 1_000) });

        expect((await limiter.hit("k")).allowed).toBe(true);

        const doc = collection.get("k");
        expect(doc?.count).toBe(1);
        expect(doc!.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    test("concurrent hits do not lose increments", async () => {
        const { limiter, collection } = setup(100);

        await Promise.all(Array.from({ length: 25 }, () => limiter.hit("k")));

        expect(collection.get("k")?.count).toBe(25);
        expect(collection.updates).toHaveLength(25);
    });
});
