import { expect, test } from "bun:test";
import { OutputQueue } from "../../src/default-implementation/output/queue";
import type { OutputEntry } from "../../src/default-implementation/output/queue";

const item = (priority = 0, bytes = 4): OutputEntry => ({ line: "log\n", priority, bytes, target: "stdout" });

test("count and UTF-8 byte budgets remain bounded and critical logs replace lower priorities", () => {
    const queue = new OutputQueue(2, 8);
    queue.push(item());
    queue.push(item());
    queue.push(item());
    expect(queue.stats()).toEqual({ queued: 2, bytes: 8, dropped: 1, criticalDropped: 0 });
    queue.push(item(1));
    queue.push(item(2));
    queue.push(item(1));
    expect(queue.stats()).toEqual({ queued: 2, bytes: 8, dropped: 4, criticalDropped: 1 });
    expect(queue.take(() => true)?.priority).toBe(1);
    expect(queue.take(() => true)?.priority).toBe(2);
    queue.push(item(2, 9));
    expect(queue.stats()).toMatchObject({ queued: 0, bytes: 0, dropped: 5, criticalDropped: 2 });
});

test("an oversized critical record does not evict retained entries and closed targets release their budget", () => {
    const queue = new OutputQueue(2, 8);
    queue.push(item());
    queue.push(item(2, 9));
    expect(queue.stats()).toMatchObject({ queued: 1, bytes: 4, dropped: 1 });
    queue.discard("stdout");
    expect(queue.stats()).toMatchObject({ queued: 0, bytes: 0, dropped: 2 });
    expect(() => new OutputQueue(0)).toThrow();
});
