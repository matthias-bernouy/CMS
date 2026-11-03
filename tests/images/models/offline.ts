// Mounted into each runtime package by offline.docker.test.ts; resolve its production dependencies.
export const offlineScriptPath = import.meta.path;

if (import.meta.main) {
    const { TransformersEmbeddings } = await import("@bernouy/text-embeddings");
    const { RepositorySearch } = await import("@bernouy/cms-repository/repository/search");

    const model = new TransformersEmbeddings({
        cacheDirectory: process.env.ULVIA_EMBEDDING_MODEL_DIR!,
        localFilesOnly: true,
        threads: 2,
    });
    const rows = [
        ["shop", "Product card with prices and shopping cart"],
        ["blog", "Article publication date and author biography"],
        ["contact", "Contact address and telephone number"],
    ].map(([id, description]) => ({
        reference: {
            kind: "collection" as const,
            publisherId: "example",
            id: id!,
            version: "1.0.0",
            digest: `sha256:${"a".repeat(64)}`,
        },
        name: id!,
        description: description!,
        categories: [],
        contractIds: [],
        text: description!,
    }));
    const search = new RepositorySearch({ load: async () => ({ revision: "offline", rows }) }, model);
    try {
        await model.initialize(new AbortController().signal);
        if (Bun.argv.includes("--expect-missing")) {
            throw new Error("An absent local model must fail initialization");
        }
        const [vector] = await model.embed(["product prices"], "query", new AbortController().signal);
        if (vector?.length !== 384 || vector.some((value) => !Number.isFinite(value))) {
            throw new Error("Invalid local embedding");
        }
        await search.prepare();
        const result = await search.search({ query: "product prices shopping cart", limit: 1 });
        if (result.mode !== "hybrid" || result.degraded || result.results[0]?.reference.id !== "shop") {
            throw new Error(`Offline search failed: ${JSON.stringify(result)}`);
        }
        console.log(
            JSON.stringify({ dimensions: vector.length, mode: result.mode, first: result.results[0].reference.id }),
        );
    } catch (error) {
        if (Bun.argv.includes("--expect-missing") && error instanceof Error && error.message.includes("not cached")) {
            console.log(JSON.stringify({ missingModelRefused: true }));
        } else {
            throw error;
        }
    } finally {
        await search.close();
        await model.close();
    }
}
