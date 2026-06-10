import { describe, test, expect } from "bun:test";
import { OptimizeQueue } from "@bernouy/cms-files";

const tick = () => new Promise((r) => setTimeout(r, 5));
const until = async (cond: () => boolean) => { while (!cond()) await tick(); };

describe("OptimizeQueue", () => {
    test("dedupes by key: the same key queued twice runs once", async () => {
        const q = new OptimizeQueue(2);
        let runs = 0;
        q.enqueue("a", async () => { runs++; });
        q.enqueue("a", async () => { runs++; }); // dedup — ignored
        await until(() => !q.busy);
        expect(runs).toBe(1);
    });

    test("runs distinct keys and respects the concurrency cap", async () => {
        const q = new OptimizeQueue(1);
        let active = 0, maxActive = 0;
        const job = () => async () => { active++; maxActive = Math.max(maxActive, active); await tick(); active--; };
        q.enqueue("a", job());
        q.enqueue("b", job());
        q.enqueue("c", job());
        await until(() => !q.busy);
        expect(maxActive).toBe(1);     // never more than `concurrency` at once
    });

    test("a job can be re-enqueued once it has finished", async () => {
        const q = new OptimizeQueue(2);
        let runs = 0;
        q.enqueue("a", async () => { runs++; });
        await until(() => !q.busy);
        q.enqueue("a", async () => { runs++; }); // same key, but the first finished
        await until(() => !q.busy);
        expect(runs).toBe(2);
    });

    test("a throwing job doesn't wedge the queue", async () => {
        const q = new OptimizeQueue(1);
        let ran = false;
        q.enqueue("bad", async () => { throw new Error("boom"); });
        q.enqueue("good", async () => { ran = true; });
        await until(() => !q.busy);
        expect(ran).toBe(true);
    });
});
