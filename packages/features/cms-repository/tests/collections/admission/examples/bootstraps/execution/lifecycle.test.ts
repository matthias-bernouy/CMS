import { expect, test } from "bun:test";
import { initializationFixture } from "./fixture";

test("start from scratch completes once without reading a Repository or creating Content", async () => {
    const f = await initializationFixture();
    expect(await f.service.entry()).toEqual({ pending: true });
    const review = await f.service.plan("admin", null);
    const completed = await f.service.apply("admin", null, review.digest);
    expect(completed).toMatchObject({ status: "completed", totalPages: 0, redirectPath: "" });
    expect(f.model.list).toBe(0);
    expect(f.model.bundles).toBe(0);
    expect((await f.raw.scanPages(undefined, 1)).pages).toEqual([]);
    await f.guarded.insertPage("/temporary", "Temporary");
    const page = await f.raw.getPage("/temporary");
    await f.guarded.deletePage(page!.id, page!.revision);
    expect(await f.service.entry()).toEqual({ pending: false });
    expect(await f.service.apply("admin", null, review.digest)).toEqual(completed);
});

test("review is read-only and explicit application installs ordinary editable Pages exactly once", async () => {
    const f = await initializationFixture();
    const review = await f.service.plan("admin", f.root);
    expect((await f.options.collections.listInstalled("default")).items).toEqual([]);
    expect((await f.raw.scanPages(undefined, 1)).pages).toEqual([]);
    expect((await f.state.read("default"))!.status).toBe("pending");
    const result = await f.service.apply("admin", f.root, review.digest);
    expect(result).toMatchObject({ status: "completed", completedPages: 1, totalPages: 1, redirectPath: "/admin" });
    expect((await f.options.collections.listInstalled("default")).items).toHaveLength(1);
    const page = await f.raw.getPage("/admin");
    expect(page?.visible).toBe(true);
    expect(page?.content).toContain("cms-bloc");
    await f.guarded.updatePage({ id: page!.id, title: "My administration" }, page!.revision);
    await f.service.apply("admin", f.root, review.digest);
    expect((await f.raw.getPage("/admin"))!.title).toBe("My administration");
    expect(await f.service.entry()).toEqual({ pending: false });
});

test("stale reviews, actor substitutions and cross-instance replay leave business state unchanged", async () => {
    const f = await initializationFixture();
    const review = await f.service.plan("admin", f.root);
    await expect(f.service.apply("another-admin", f.root, review.digest)).rejects.toThrow("stale");
    const other = await initializationFixture("instance-b");
    await expect(other.service.apply("admin", other.root, review.digest)).rejects.toThrow("stale");
    const revision = await f.raw.getSystemRevision();
    await f.raw.updateSystem({ site: { ...(await f.raw.getSystem()).site, name: "Changed" } }, revision);
    await expect(f.service.apply("admin", f.root, review.digest)).rejects.toThrow("stale");
    for (const item of [f, other]) {
        expect((await item.raw.scanPages(undefined, 1)).pages).toEqual([]);
        expect((await item.options.collections.listInstalled("default")).items).toEqual([]);
        expect((await item.state.read("default"))!.status).toBe("pending");
    }
});

test("missing initialization state is never inferred from empty Pages or repaired by reads", async () => {
    const f = await initializationFixture();
    f.records.clear();
    expect(await f.service.entry()).toEqual({ pending: false });
    expect((await f.service.status()).status).toBe("unavailable");
    await expect(f.service.plan("admin", null)).rejects.toThrow("not configured");
    expect(f.records.size).toBe(0);
});

test("cancelled preparation and a lost operation lease refuse before any site mutation", async () => {
    const f = await initializationFixture();
    await expect(f.service.plan("admin", f.root, undefined, AbortSignal.abort())).rejects.toThrow();
    expect(f.model.list).toBe(0);
    const review = await f.service.plan("admin", f.root);
    await expect(
        f.service.apply("admin", f.root, review.digest, undefined, {
            signal: new AbortController().signal,
            assertHeld: () => {
                throw new Error("Operation lease lost");
            },
        }),
    ).rejects.toThrow("Operation lease lost");
    expect((await f.raw.scanPages(undefined, 1)).pages).toEqual([]);
    expect((await f.options.collections.listInstalled("default")).items).toEqual([]);
    expect(await f.options.upgrades.getActive("default")).toBeNull();
});
