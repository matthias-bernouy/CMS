import { expect, test } from "bun:test";
import { MemoryVectorStore } from "@bernouy/text-search";
import { RepositorySearch } from "cms-repository/repository/search/core/service";
import { row, source } from "./fixture";

test("exact resource IDs lead, versions collapse before filtering, and cursors are revision-bound", async () => {
    const corpus = source([
        row("shop", "shop shop shop"),
        row("shop", "Product card", "1.0.1"),
        row("other", "shop"),
        row("hidden", "Product", "1.0.0", "hidden-card"),
        row("hidden", "Hidden newer collection", "1.0.1"),
    ]);
    const service = new RepositorySearch(corpus);
    const first = await service.search({ query: "shop", limit: 1 });
    expect(first.results[0]?.reference).toMatchObject({ id: "shop", version: "1.0.1" });
    const copied = structuredClone(first.results[0]!.reference);
    (first.results[0]!.reference as { id: string }).id = "changed-by-caller";
    expect((await service.search({ query: "shop", limit: 1 })).results[0]?.reference).toEqual(copied);
    const second = await service.search({ query: "shop", cursor: first.nextCursor, limit: 1 });
    expect(second.results[0]?.reference.id).toBe("other");
    expect((await service.search({ query: "Product", kinds: ["bloc"] })).results).toEqual([]);
    expect((await service.search({ query: "shop", publisherId: "another.publisher" })).results).toEqual([]);
    corpus.replace([row("shop")]);
    await expect(service.search({ query: "shop", cursor: first.nextCursor })).rejects.toThrow("cursor expired");
    await expect(service.search({ query: "shop", url: "https://attacker.test" })).rejects.toThrow();
    await service.close();
});

test("hybrid paraphrases reuse unchanged vectors across corpus updates and explicitly fall back", async () => {
    const corpus = source([row("shop"), row("gallery", "Photo gallery")]);
    const passages: string[] = [];
    const model = {
        model: "fixture-v1",
        embed: async (texts: readonly string[], kind: "query" | "passage") => {
            if (kind === "passage") {
                passages.push(...texts);
            }
            return texts.map((text) => (text.includes("gallery") ? [0, 1] : [1, 0]));
        },
    };
    const service = new RepositorySearch(corpus, model, new MemoryVectorStore());
    await service.prepare();
    const result = await service.search({ query: "carte marchande" });
    expect(result.mode).toBe("hybrid");
    expect(result.results[0]?.reference.id).toBe("shop");
    expect(passages).toHaveLength(2);
    corpus.replace([row("shop"), row("gallery", "Photo gallery"), row("news", "News article")]);
    await service.prepare();
    expect(passages).toHaveLength(3);
    expect((await service.search({ query: "carte", contractId: "ulvia/missing" })).results).toEqual([]);
    await service.close();
    const lexical = new RepositorySearch(corpus);
    expect(await lexical.search({ query: "Product" })).toMatchObject({ mode: "lexical", degraded: true });
    await lexical.close();
});

test("cold requests never wait for corpus inference and outstanding searches are bounded", async () => {
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
        release = resolve;
    });
    let inferences = 0;
    const service = new RepositorySearch(source(), {
        model: "slow",
        embed: async (texts) => {
            inferences++;
            await waiting;
            return texts.map(() => [1, 0]);
        },
    });
    const results = await Promise.all(Array.from({ length: 8 }, () => service.search({ query: "Product" })));
    expect(results.every((result) => result.degraded)).toBe(true);
    await expect(Promise.all(Array.from({ length: 9 }, () => service.search({ query: "Product" })))).rejects.toThrow(
        "unavailable",
    );
    expect(inferences).toBe(1);
    release();
    await service.close();
});

test("preparation and queries share the latest-release corpus before inference", async () => {
    const rows = [row("shop", "Product card", "1.0.0"), row("shop", "Product card", "1.0.1")];
    const passages: string[] = [];
    const service = new RepositorySearch(source(rows), {
        model: "latest-only",
        embed: async (texts, kind) => {
            if (kind === "passage") {
                passages.push(...texts);
            }
            return texts.map(() => [1, 0]);
        },
    });
    try {
        await service.prepare();
        expect(passages).toHaveLength(1);
        expect((await service.search({ query: "shop" })).results.map((result) => result.reference.version)).toEqual([
            "1.0.1",
        ]);
    } finally {
        await service.close();
    }
});
