import { expect, test } from "bun:test";
import { discoveryFixture } from "./fixture";

test("reproduces complete history reads and repeated release validation across recipe pages", async () => {
    const f = await discoveryFixture([
        { name: "alpha", versions: Array.from({ length: 257 }, (_, index) => `1.${index}.0`) },
        ...["bravo", "charlie", "delta", "echo"].map((name) => ({ name })),
    ]);
    const before = await f.businessState();
    const first = await f.service.list();
    const second = await f.service.list(first.cursor);
    expect(first.items).toHaveLength(4);
    expect(second.items).toHaveLength(1);
    expect(f.requests.filter(({ path }) => path === "/v1/catalogue")).toHaveLength(4);
    expect(f.observed.catalogueEntries).toBe(522);
    expect(f.observed.verifications).toBe(5);
    expect(f.requests.filter(({ path }) => path.startsWith("/v1/releases/"))).toHaveLength(5);
    const bytes = f.observed.releaseBytes;
    await f.service.list();
    expect(f.observed.verifications).toBe(9);
    expect(f.observed.releaseBytes).toBeGreaterThan(bytes);
    expect(await f.businessState()).toEqual(before);
});

// Remove .failing when discovery uses paginated recipe summaries instead of the complete release history.
test.failing("recipe discovery remains available with more than 1024 historical releases of one collection", async () => {
    const f = await discoveryFixture([
        { name: "atlas", versions: Array.from({ length: 1025 }, (_, index) => `1.${index}.0`) },
    ]);
    const result = await f.service.list();
    expect(result.items).toHaveLength(1);
    expect(result.items[0].root.version).toBe("1.1024.0");
    expect(result.cursor).toBe("");
});

test.failing("listing recipe summaries does not download or revalidate complete collection releases", async () => {
    const f = await discoveryFixture();
    expect((await f.service.list()).items).toHaveLength(1);
    expect(f.observed.releaseBytes).toBe(0);
    expect(f.observed.verifications).toBe(0);
});
