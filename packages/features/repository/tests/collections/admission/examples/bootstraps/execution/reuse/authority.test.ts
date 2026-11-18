import { expect, test } from "bun:test";
import { createCmsSiteBloc, publishCmsSiteBloc, readCmsSiteBloc } from "@bernouy/content";
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

test("recreating a site composition invalidates warm initialization validation even at the same published revision", async () => {
    const f = await initializationFixture();
    const input = { tag: "site-shared", name: "Shared", group: "Site", content: "<p>Before</p>" };
    await createCmsSiteBloc(f.raw, input);
    await publishCmsSiteBloc(f.raw, { tag: input.tag, revision: 1 });
    const original = await readCmsSiteBloc(f.raw, { tag: input.tag });
    let validations = 0;
    const validate = f.options.validateCandidate;
    f.options.validateCandidate = async (...args) => {
        validations++;
        return validate(...args);
    };
    await f.service.plan("admin", f.root);
    await f.service.plan("admin", f.root);
    expect(validations).toBe(1);
    await f.raw.deleteSiteBloc(input.tag, 1, original.definitionId);
    await createCmsSiteBloc(f.raw, { ...input, content: "<p>Replacement</p>" });
    await publishCmsSiteBloc(f.raw, { tag: input.tag, revision: 1 });
    await f.service.plan("admin", f.root);
    expect(validations, "a different definition must not reuse the previous initialization validation").toBe(2);
    expect((await f.raw.scanPages(undefined, 1)).pages).toEqual([]);
});
