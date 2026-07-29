import { describe, expect, test } from "bun:test";
import {
    InProcessSourceImageJobScheduler,
    type SourceImageJob,
    type SourceImageJobHandler,
} from "@bernouy/cms-source-images";

describe("In-process Source image job scheduler", () => {
    test("bounds concurrency and de-duplicates pending or active jobs", async () => {
        let active = 0;
        let maxActive = 0;
        const completed: string[] = [];
        const handler: SourceImageJobHandler = {
            handle: async (job) => {
                active += 1;
                maxActive = Math.max(maxActive, active);
                await Bun.sleep(10);
                active -= 1;
                completed.push(job.deduplicationKey);
                return { disposition: "completed" };
            },
        };
        const scheduler = new InProcessSourceImageJobScheduler(handler, { concurrency: 2, maxQueue: 2 });
        const first = job("lookup-first");

        const results = await Promise.all([
            scheduler.enqueue(first),
            scheduler.enqueue(first),
            scheduler.enqueue(job("lookup-second")),
            scheduler.enqueue(job("lookup-third")),
        ]);

        expect(results).toEqual(["accepted", "duplicate", "accepted", "saturated"]);

        await waitFor(() => completed.length === 2);
        expect(maxActive).toBe(2);
        expect(new Set(completed)).toEqual(new Set(["lookup-first", "lookup-second"]));
        expect(scheduler.activeCount).toBe(0);
        expect(scheduler.queuedCount).toBe(0);
    });

    test("takes a structured clone before executing a job", async () => {
        let handled: SourceImageJob | undefined;
        const scheduler = new InProcessSourceImageJobScheduler({
            handle: async (job) => {
                handled = job;
                return { disposition: "completed" };
            },
        });
        const input = job("lookup-copy") as MutableSourceImageJob;

        expect(await scheduler.enqueue(input)).toBe("accepted");
        input.source.url = "https://changed.test/.cms/sources/photos/image";
        await waitFor(() => handled !== undefined);

        expect(handled?.source.url).toBe("https://cms.test/.cms/sources/photos/image");
    });
});

type MutableSourceImageJob = Omit<SourceImageJob, "source"> & {
    source: { url: string; headers: Record<string, string> };
};

function job(key: string): SourceImageJob {
    return {
        version: 2,
        deduplicationKey: key,
        source: { url: "https://cms.test/.cms/sources/photos/image", headers: {} },
        logicalKey: "logical-placeholder",
        variants: [{ lookupKey: key, width: 128 }],
        recipeId: "recipe-placeholder",
        encoderIdentity: "encoder-placeholder",
        priority: "media-cache",
    };
}

async function waitFor(predicate: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        if (predicate()) {
            return;
        }
        await Bun.sleep(5);
    }
    throw new Error("Source image scheduler test timed out");
}
