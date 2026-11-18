import { expect, test } from "bun:test";
import { createContentReader } from "@bernouy/content/rendering";
import { ContentDelivery } from "@bernouy/content/public-delivery";
import { InMemoryCache } from "@bernouy/http-runner";
import { NOOP_LOGGER } from "@bernouy/logging";
import { editingFixture } from "./fixture";

test("favicon HTTP/MCP updates preserve settings, detect stale revisions and reach anonymous Page and manifest output", async () => {
    const f = await editingFixture();
    const icon = "/.cms/call/ulvia/cms.files/files/file_icon/" + "a".repeat(64);
    await f.call("site-blocs.create", {
        tag: "site-home",
        name: "Home",
        group: "Site",
        content: "<main><p>Home</p></main>",
    });
    await f.call("site-blocs.publish", { tag: "site-home", revision: 1 });
    await f.repository.insertPage("/", "Home", '<div cms-bloc="site-home"></div>');
    const page = (await f.repository.getPage("/"))!;
    await f.repository.updatePage({ id: page.id, visible: true }, page.revision);
    const before = await f.repository.getSystem();
    const set = await f.call("site.favicon.update", { expectedRevision: 0, favicon: icon });
    expect(set.structuredContent).toMatchObject({ output: { revision: 1, favicon: icon } });
    expect(await f.repository.getSystem()).toEqual({ ...before, site: { ...before.site, favicon: icon } });
    const conflict = await f.request("/site/favicon", { expectedRevision: 0, favicon: "/stale.svg" });
    expect(conflict.status).toBe(409);
    expect((await f.repository.getSystem()).site.favicon).toBe(icon);
    const delivery = new ContentDelivery({
        content: createContentReader(f.repository),
        cache: new InMemoryCache(),
        logger: NOOP_LOGGER,
        publicUrl: "https://site.test",
        resolveContributedAssets: async (value) => value,
        serveCollectionAsset: async () => new Response(null, { status: 404 }),
    });
    const render = async (path: string) =>
        delivery.resolvePath({ path, method: "GET", query: [] }, { kind: "anonymous" });
    const response = await render("/");
    expect(response.status).toBe(200);
    expect((await response.text()).match(/<link[^>]*rel="icon"[^>]*>/)?.[0]).toContain(`href="${icon}"`);
    expect(await (await render("/manifest.webmanifest")).json()).toMatchObject({ icons: [{ src: icon }] });
    const cleared = await f.request("/site/favicon", { expectedRevision: 1, favicon: null });
    expect(cleared.status).toBe(200);
    expect(await cleared.json()).toEqual({ revision: 2, favicon: "" });
    expect(await (await render("/manifest.webmanifest")).json()).toMatchObject({ icons: [{ src: "/favicon.ico" }] });
    expect((await f.call("site.favicon.get")).structuredContent).toMatchObject({
        output: { revision: 2, favicon: "" },
    });
    expect((await (await render("/")).text()).match(/<link[^>]*rel="icon"[^>]*>/)?.[0]).toContain("/favicon.ico");
});
