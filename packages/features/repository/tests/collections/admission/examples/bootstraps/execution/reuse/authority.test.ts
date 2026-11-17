import { expect, test } from "bun:test";
import { initializationFixture } from "../fixture";

test("a warm preparation still refuses revoked execution and cancellation", async () => {
    const f = await initializationFixture();
    await f.service.plan("admin", f.root);
    await expect(f.service.plan("admin", f.root, undefined, AbortSignal.abort())).rejects.toThrow();
    Object.assign(f.options, {
        execution: async () => {
            throw new Error("Execution revoked");
        },
    });
    await expect(f.service.plan("admin", f.root)).rejects.toThrow("Execution revoked");
    expect((await f.state.read("default"))?.status).toBe("pending");
    expect((await f.raw.scanPages(undefined, 1)).pages).toEqual([]);
});

test("site Bloc revisions invalidate warm validation and missing revision evidence disables reuse", async () => {
    const f = await initializationFixture();
    let revision = 0;
    let previews = 0;
    const validate = f.options.validateCandidate;
    Object.assign(f.options.repository, { getSiteBlocsRevision: async () => revision });
    Object.assign(f.options, {
        validateCandidate: async (...args: Parameters<typeof validate>) => {
            previews++;
            return validate(...args);
        },
    });
    await f.service.plan("admin", f.root);
    await f.service.plan("admin", f.root);
    expect(previews).toBe(1);
    revision++;
    await f.service.plan("admin", f.root);
    expect(previews).toBe(2);
    Object.assign(f.options.repository, { getSiteBlocsRevision: undefined });
    await f.service.plan("admin", f.root);
    await f.service.plan("admin", f.root);
    expect(previews).toBe(4);
});

test("new Pages observed after a warm availability lookup prevent returning a cached review", async () => {
    const f = await initializationFixture();
    await f.service.plan("admin", f.root);
    const list = f.options.source.list;
    f.options.source.list = async () => {
        const result = await list();
        await f.raw.insertPage("/concurrent", "Concurrent Page");
        return result;
    };
    await expect(f.service.plan("admin", f.root)).rejects.toThrow("empty site");
    expect(await f.raw.getPage("/admin")).toBeNull();
    expect((await f.raw.getPage("/concurrent"))?.title).toBe("Concurrent Page");
    expect((await f.options.collections.listInstalled("default")).items).toEqual([]);
});
