import { expect, test } from "bun:test";
import { RenderingResourceReads } from "@bernouy/cms-content/rendering";
import { renderingScopeFixture } from "./renderingScopeFixture";

test("a warm Page render reads one collection state and one local catalogue while rereading settings and routes", async () => {
    const f = await renderingScopeFixture();
    const inputs = await f.reader.getPageRenderInputs!("/");
    expect(inputs.route?.kind).toBe("current");
    expect(inputs.renderableBlocs.map((bloc) => bloc.id)).toContain("scoped-card");
    expect(f.storage.siteReads).toBe(1);
    expect(f.counts).toEqual({ blocs: 1, system: 2, routes: 2 });
    await f.reader.getPageRenderInputs!("/");
    expect(f.storage.siteReads).toBe(2);
    expect(f.counts).toEqual({ blocs: 2, system: 4, routes: 4 });
});

test("each rendering reloads collection texts, removals and Page visibility without retaining a read scope", async () => {
    const f = await renderingScopeFixture();
    const first = await f.reader.getPageRenderInputs!("/");
    expect(first.contentTexts[0]!.resolve("en")).toEqual({ title: "Initial" });
    await f.store.saveTexts("site", "scoped", 1, { title: { en: "Changed" } });
    const second = await f.reader.getPageRenderInputs!("/");
    expect(second.contentTexts[0]!.resolve("en")).toEqual({ title: "Changed" });
    expect(second.artifactRevision).not.toBe(first.artifactRevision);
    await f.store.uninstall("site", "scoped", 2);
    const removed = await f.reader.getPageRenderInputs!("/");
    expect(removed.renderableBlocs.map((bloc) => bloc.id)).not.toContain("scoped-card");
    expect(removed.contentTexts).toEqual([]);
    const current = (await f.local.getPage("/"))!;
    await f.local.updatePage({ id: current.id, visible: false }, current.revision);
    expect((await f.reader.getPageRenderInputs!("/")).route).toEqual({ kind: "unavailable" });
});

test("settings and route migration changes remain visible while resource reads are shared", async () => {
    const f = await renderingScopeFixture();
    const getSystem = f.local.getSystem.bind(f.local);
    f.local.getSystem = async () => ({ ...(await getSystem()), pageRoutesUpdating: f.counts.system > 1 });
    expect((await f.reader.getPageRenderInputs!("/")).route).toEqual({ kind: "updating" });
    expect(f.storage.siteReads).toBe(1);
    expect(f.counts.system).toBe(2);
});

test("scoped catalogues return independent local objects and never share resources across adapters", async () => {
    const a = await renderingScopeFixture();
    const b = await renderingScopeFixture();
    a.localBlocs = [
        {
            id: "local-card",
            name: "Local",
            group: "Local",
            description: "Local",
            kind: "component",
            markupHTML: "<article></article>",
            root: { accepts: ["div"] },
            hasBehavior: false,
            ownership: { kind: "code-managed" },
        },
    ];
    const reads = new RenderingResourceReads();
    const options = { includeHidden: true, projection: "rendering" as const };
    const first = await a.repository.getBlocsList(options, reads);
    first[0]!.markupHTML = "caller mutation";
    expect((await a.repository.getBlocsList(options, reads))[0]!.markupHTML).toBe("<article></article>");
    expect((await b.repository.getBlocsList(options, reads)).some((bloc) => bloc.id === "local-card")).toBe(false);
    expect(a.storage.siteReads).toBe(1);
    expect(b.storage.siteReads).toBe(1);
    reads.close();
    await expect(a.repository.getBlocsList(options, reads)).rejects.toThrow("closed");
});
