import { expect, test } from "bun:test";
import { RenderingResourceReads } from "@bernouy/cms-content/rendering";

test("rendering resources share only the exact owner and key within one open operation", async () => {
    const reads = new RenderingResourceReads();
    const owner = {};
    let loads = 0;
    const load = async () => ++loads;
    expect(
        await Promise.all([reads.resource(owner, "resource", load), reads.resource(owner, "resource", load)]),
    ).toEqual([1, 1]);
    expect(await reads.resource({}, "resource", load)).toBe(2);
    expect(await reads.resource(owner, "other", load)).toBe(3);
    reads.close();
    await expect(reads.resource(owner, "resource", load)).rejects.toThrow("closed");
    expect(await new RenderingResourceReads().resource(owner, "resource", load)).toBe(4);
});

test("failed loads are retryable and closing an in-flight operation prevents late use", async () => {
    const reads = new RenderingResourceReads();
    const owner = {};
    await expect(
        reads.resource(owner, "resource", async () => {
            throw new Error("failed");
        }),
    ).rejects.toThrow("failed");
    expect(await reads.resource(owner, "resource", async () => "retried")).toBe("retried");
    let finish!: (value: string) => void;
    const pending = reads.resource(
        owner,
        "pending",
        () =>
            new Promise<string>((resolve) => {
                finish = resolve;
            }),
    );
    await Promise.resolve();
    reads.close();
    finish("late");
    await expect(pending).rejects.toThrow("closed");
});

test("a queued resource read cannot start after its operation has closed", async () => {
    const reads = new RenderingResourceReads();
    let loads = 0;
    const pending = reads.resource({}, "queued", async () => ++loads);
    reads.close();
    await expect(pending).rejects.toThrow("closed");
    expect(loads).toBe(0);
});

test("Page input loading closes its resource context on success and failure", async () => {
    const { createContentReader, InMemoryContentRepository } = await import("@bernouy/cms-content");
    for (const fail of [false, true]) {
        let captured: RenderingResourceReads | undefined;
        const repository = Object.assign(new InMemoryContentRepository(), {
            getTextContributions: async (reads?: RenderingResourceReads) => {
                captured = reads;
                return { revision: 0, texts: [] };
            },
            getBlocsList: async () => {
                if (fail) {
                    throw new Error("render metadata unavailable");
                }
                return [];
            },
        });
        const result = createContentReader(repository).getPageRenderInputs!("/");
        if (fail) {
            await expect(result).rejects.toThrow("render metadata unavailable");
        } else {
            await result;
        }
        expect(captured).toBeDefined();
        await expect(captured!.resource({}, "late", async () => "unreachable")).rejects.toThrow("closed");
    }
});
