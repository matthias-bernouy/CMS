import { expect, test } from "bun:test";
import { CollectionSourceCache } from "../../../../src/capabilities/installations/sources/cache";

test("shared validation survives one caller abort and cancels when its last caller leaves", async () => {
    const cache = new CollectionSourceCache<number>(2, 16, () => 1);
    let finish!: (value: number) => void;
    let workSignal!: AbortSignal;
    let loads = 0;
    const loader = (signal: AbortSignal) => {
        workSignal = signal;
        loads++;
        return new Promise<number>((resolve) => {
            finish = resolve;
        });
    };
    const first = new AbortController();
    const second = new AbortController();
    const a = cache.load("same", loader, first.signal);
    const b = cache.load("same", loader, second.signal);
    await Promise.resolve();
    first.abort();
    await expect(a).rejects.toMatchObject({ name: "AbortError" });
    expect(workSignal.aborted).toBe(false);
    finish(7);
    expect(await b).toBe(7);
    expect(await cache.load("same", loader)).toBe(7);
    expect(loads).toBe(1);
    const controller = new AbortController();
    const c = cache.load("other", loader, controller.signal);
    await Promise.resolve();
    controller.abort();
    await expect(c).rejects.toMatchObject({ name: "AbortError" });
    expect(workSignal.aborted).toBe(true);
    finish(8);
    await Promise.resolve();
    expect(await cache.load("other", async () => 9)).toBe(9);
});

test("abandoned loaders still occupy capacity until they actually settle", async () => {
    const cache = new CollectionSourceCache<string>(2, 10, () => 1, 1);
    const controller = new AbortController();
    let finish!: (value: string) => void;
    const first = cache.load(
        "a",
        () =>
            new Promise((resolve) => {
                finish = resolve;
            }),
        controller.signal,
    );
    await Promise.resolve();
    controller.abort();
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    await expect(cache.load("b", async () => "b")).rejects.toMatchObject({ code: "CORE_UNAVAILABLE" });
    finish("abandoned");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await cache.load("a", async () => "fresh")).toBe("fresh");
});
