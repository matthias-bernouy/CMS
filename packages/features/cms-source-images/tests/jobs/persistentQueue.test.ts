import { describe, expect, test } from "bun:test";
import { InMemorySourceImageJobQueue, SOURCE_IMAGE_JOB_VERSION, type SourceImageJob } from "@bernouy/cms-source-images";

describe("Persistent Source image queue contract", () => {
    test("deduplicates, reclaims expired leases, and fences old owners", async () => {
        const queue = new InMemorySourceImageJobQueue();
        const input = job("first");
        const now = Date.now();

        expect(await queue.enqueue(input)).toBe("accepted");
        expect(await queue.enqueue(input)).toBe("duplicate");
        const first = await queue.claim({
            owner: "worker-a",
            now,
            leaseMs: 100,
            priorities: ["media-critical"],
        });
        expect(first).toMatchObject({ owner: "worker-a", attempts: 1 });
        expect(
            await queue.claim({
                owner: "worker-b",
                now: now + 50,
                leaseMs: 100,
                priorities: ["media-critical"],
            }),
        ).toBeNull();

        const reclaimed = await queue.claim({
            owner: "worker-b",
            now: now + 101,
            leaseMs: 100,
            priorities: ["media-critical"],
        });
        expect(reclaimed).toMatchObject({ owner: "worker-b", attempts: 2 });
        expect(await queue.complete(first!)).toBeFalse();
        expect(await queue.complete(reclaimed!)).toBeTrue();
    });

    test("makes retries unavailable until their persisted backoff expires", async () => {
        const queue = new InMemorySourceImageJobQueue();
        await queue.enqueue(job("retry"));
        const claim = await queue.claim({
            owner: "worker",
            now: Date.now(),
            leaseMs: 1_000,
            priorities: ["media-critical"],
        });
        const availableAt = Date.now() + 10_000;

        expect(await queue.retry({ token: claim!.token, owner: claim!.owner, availableAt, reason: "test" })).toBeTrue();
        expect(
            await queue.claim({
                owner: "worker",
                now: availableAt - 1,
                leaseMs: 1_000,
                priorities: ["media-critical"],
            }),
        ).toBeNull();
        expect(
            await queue.claim({
                owner: "worker",
                now: availableAt,
                leaseMs: 1_000,
                priorities: ["media-critical"],
            }),
        ).toMatchObject({ attempts: 2 });
    });
});

function job(identity: string): SourceImageJob {
    return {
        version: SOURCE_IMAGE_JOB_VERSION,
        deduplicationKey: `source-image-set:${identity}`,
        source: { url: "https://cms.test/.cms/sources/photos/publicPhoto?id=photo", headers: {} },
        logicalKey: `logical-${"a".repeat(64)}`,
        variants: [{ lookupKey: `lookup-${"b".repeat(64)}`, width: 128 }],
        recipeId: "source-responsive-webp-v1",
        encoderIdentity: "test-encoder",
        priority: "media-critical",
    };
}
