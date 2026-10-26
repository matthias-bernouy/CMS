import { defaultSystem } from "@bernouy/cms-content";
import { projectRenderingSettings } from "@bernouy/cms-content/rendering";
import { expect, test } from "bun:test";
import { PageRenderInputCache } from "../../src/runtime/content/delivery/PageRenderInputCache";

test("invalidation during a cold read cannot repopulate the cache with stale inputs", async () => {
    const reads: Deferred<unknown>[] = [];
    const cache = new PageRenderInputCache(async () => {
        const pending = deferred<unknown>();
        reads.push(pending);
        return pending.promise;
    });

    const staleRead = cache.get("/");
    await until(() => reads.length === 1);
    cache.invalidate();
    const currentRead = cache.get("/");
    await until(() => reads.length === 2);

    reads[0]!.resolve(renderInputs("stale"));
    reads[1]!.resolve(renderInputs("current"));
    expect((await staleRead).artifactRevision).toBe("stale");
    expect((await currentRead).artifactRevision).toBe("current");
    expect((await cache.get("/")).artifactRevision).toBe("current");
    expect(reads).toHaveLength(2);
});

test("soft expiration serves stale inputs once and refreshes the next request", async () => {
    const operations: string[] = [];
    let now = 0;
    let revision = "one";
    const cache = new PageRenderInputCache(
        async (operation) => {
            operations.push(operation);
            return operation === "content.page-render-revision" ? revision : renderInputs(revision);
        },
        { freshForMs: 10, staleForMs: 100, now: () => now },
    );

    expect((await cache.get("/")).artifactRevision).toBe("one");
    now = 10;
    revision = "two";
    expect((await cache.get("/")).artifactRevision).toBe("one");
    await until(() => operations.filter((operation) => operation === "content.page-render-inputs").length === 2);
    expect((await cache.get("/")).artifactRevision).toBe("two");
    expect(operations).toEqual([
        "content.page-render-inputs",
        "content.page-render-revision",
        "content.page-render-inputs",
    ]);
});

function renderInputs(revision: string): unknown {
    return {
        route: null,
        artifactRevision: revision,
        renderingRevision: revision,
        settings: projectRenderingSettings(defaultSystem()),
        texts: { defaultLocale: "en", sources: [] },
        renderableBlocs: [],
        blocViews: {},
        collectionAssets: [],
    };
}

function deferred<T>(): Deferred<T> {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((accept) => {
        resolve = accept;
    });
    return { promise, resolve };
}

async function until(predicate: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 10 && !predicate(); attempt += 1) {
        await Promise.resolve();
    }
    expect(predicate()).toBeTrue();
}

type Deferred<T> = {
    readonly promise: Promise<T>;
    readonly resolve: (value: T) => void;
};
