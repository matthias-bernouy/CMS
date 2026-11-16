import { expect, test } from "bun:test";
import { discoveryFixture } from "./fixture";

test("each recipe page uses one indexed request regardless of release history or repeated reads", async () => {
    const f = await discoveryFixture([
        { name: "alpha", versions: Array.from({ length: 257 }, (_, index) => `1.${index}.0`) },
        ...["bravo", "charlie", "delta", "echo"].map((name) => ({ name })),
    ]);
    const before = await f.businessState();
    const first = await f.service.list();
    const second = await f.service.list(first.cursor);
    expect(first.items).toHaveLength(4);
    expect(second.items).toHaveLength(1);
    await f.service.list();
    expect(f.requests).toHaveLength(3);
    expect(f.requests.every(({ path, method }) => path === "/v1/recipes" && method === "QUERY")).toBe(true);
    expect(f.observed.catalogueEntries).toBe(0);
    expect(f.observed.verifications).toBe(0);
    expect(f.observed.releaseBytes).toBe(0);
    expect(await f.businessState()).toEqual(before);
});

test("recipe discovery remains available with more than 1024 historical releases of one collection", async () => {
    const f = await discoveryFixture([
        { name: "atlas", versions: Array.from({ length: 1025 }, (_, index) => `1.${index}.0`) },
    ]);
    const result = await f.service.list();
    expect(result.items).toHaveLength(1);
    expect(result.items[0].root.version).toBe("1.1024.0");
    expect(result.cursor).toBe("");
});

test("listing recipe summaries does not download or revalidate complete collection releases", async () => {
    const f = await discoveryFixture();
    expect((await f.service.list()).items).toHaveLength(1);
    expect(f.observed.releaseBytes).toBe(0);
    expect(f.observed.verifications).toBe(0);
});
