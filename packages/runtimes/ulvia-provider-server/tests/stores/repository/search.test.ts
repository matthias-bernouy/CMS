import { expect, test } from "bun:test";
import { MemoryVectorStore } from "@bernouy/text-search";
import { RepositorySearch } from "@bernouy/cms-repository/repository/search";

test("shared host vectors survive index disposal without sharing scoped results, and invalidate by model and text", async () => {
    const vectors = new MemoryVectorStore(4);
    let passages = 0;
    const model = {
        model: "revision-one",
        embed: async (texts: readonly string[], kind: string) => {
            if (kind === "passage") {
                passages += texts.length;
            }
            return texts.map(() => [1, 0]);
        },
    };
    const opened: RepositorySearch[] = [];
    const open = (publisher: string, text: string, version = model.model) => {
        const search = new RepositorySearch(source(publisher, text), { ...model, model: version }, vectors);
        opened.push(search);
        return search;
    };
    try {
        const first = open("publisher.a", "shared card");
        expect(await first.prepare()).toEqual({ embedded: 1, reused: 0 });
        await first.close();
        const second = open("publisher.b", "shared card");
        expect(await second.prepare()).toEqual({ embedded: 0, reused: 1 });
        expect(passages).toBe(1); // Without the runtime's shared cache, this requires two passage inferences.
        const results = await second.search({ query: "shared" });
        expect(results.mode).toBe("hybrid");
        expect(results.results.map(({ reference }) => reference.publisherId)).toEqual(["publisher.b"]);
        expect(await open("publisher.b", "changed card").prepare()).toEqual({ embedded: 1, reused: 0 });
        expect(await open("publisher.b", "shared card", "revision-two").prepare()).toEqual({ embedded: 1, reused: 0 });
        vectors.clear();
        expect(await open("publisher.b", "shared card").prepare()).toEqual({ embedded: 1, reused: 0 });
        expect(passages).toBe(4);
    } finally {
        await Promise.all(opened.map((search) => search.close()));
    }
});

test("failed passage inference cannot poison the host cache for a later index", async () => {
    const vectors = new MemoryVectorStore(4);
    let fail = true;
    let calls = 0;
    const model = {
        model: "retryable-model",
        embed: async (texts: readonly string[]) => {
            calls++;
            if (fail) {
                throw new Error("Unavailable");
            }
            return texts.map(() => [1, 0]);
        },
    };
    const failed = new RepositorySearch(source("publisher.a", "retryable content"), model, vectors);
    await expect(failed.prepare()).rejects.toThrow("Unavailable");
    await failed.close();
    fail = false;
    const recovered = new RepositorySearch(source("publisher.a", "retryable content"), model, vectors);
    try {
        expect(await recovered.prepare()).toEqual({ embedded: 1, reused: 0 });
        expect(calls).toBe(2);
    } finally {
        await recovered.close();
    }
});

function source(publisherId: string, text: string) {
    return {
        load: async () => ({
            revision: "one",
            rows: [
                {
                    reference: {
                        kind: "collection" as const,
                        publisherId,
                        id: "cards",
                        version: "1.0.0",
                        digest: `sha256:${"a".repeat(64)}`,
                    },
                    name: "Shared cards",
                    description: text,
                    categories: [],
                    contractIds: [],
                    text,
                },
            ],
        }),
    };
}
