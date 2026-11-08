import { expect, test } from "bun:test";
import { CmsDocumentation } from "@bernouy/documentation";
import { fixture } from "../fixture";

function gate() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
        resolve = done;
    });
    return { promise, resolve: () => resolve() };
}

test("shutdown waits for native work, stops subsequent batches and rejects later lookups", async () => {
    const f = await fixture("example.large", true);
    const started = gate();
    const finish = gate();
    let calls = 0;
    let writes = 0;
    const service = new CmsDocumentation(
        f.source,
        {
            model: "slow",
            embed: async (texts) => {
                calls++;
                started.resolve();
                await finish.promise;
                return texts.map(() => [1, 0]);
            },
        },
        {
            get: async () => new Map(),
            put: async () => {
                writes++;
            },
        },
    );
    const preparation = service.prepare();
    const rejected = preparation.then(
        () => null,
        (error: unknown) => error,
    );
    await started.promise;
    let closed = false;
    const closing = service.close().then(() => {
        closed = true;
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(closed).toBe(false);
    finish.resolve();
    expect(await rejected).toBeInstanceOf(Error);
    await closing;
    expect(calls).toBe(1);
    expect(writes).toBe(0);
    await expect(service.search({ query: "revision" })).rejects.toMatchObject({ code: "CORE_UNAVAILABLE" });
    await expect(service.prepare()).rejects.toMatchObject({ code: "CORE_UNAVAILABLE" });
});

test("preparation fences a selection revision changed during inference", async () => {
    const f = await fixture();
    const started = gate();
    const finish = gate();
    const service = new CmsDocumentation(f.source, {
        ...f.model,
        embed: async (texts) => {
            started.resolve();
            await finish.promise;
            return texts.map(() => [1, 0]);
        },
    });
    const preparation = service.prepare();
    await started.promise;
    f.changeDuringRead();
    finish.resolve();
    await expect(preparation).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    await expect(service.search({ query: "revision" })).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    await service.close();
});

test("timed-out warm queries keep their slots until native work actually finishes", async () => {
    const f = await fixture();
    const finish = gate();
    let queries = 0;
    const service = new CmsDocumentation(
        f.source,
        {
            model: "slow-query",
            embed: async (texts, kind) => {
                if (kind === "query") {
                    queries++;
                    await finish.promise;
                }
                return texts.map(() => [1, 0]);
            },
        },
        undefined,
        5,
    );
    await service.prepare();
    const results = await Promise.all(Array.from({ length: 12 }, () => service.search({ query: "revision" })));
    expect(results.every((result) => result.degraded)).toBe(true);
    expect(queries).toBe(4);
    let closed = false;
    const closing = service.close().then(() => {
        closed = true;
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(closed).toBe(false);
    finish.resolve();
    await closing;
    expect(closed).toBe(true);
});
