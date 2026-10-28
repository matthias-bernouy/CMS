import { expect, test } from "bun:test";
import { InMemoryContentRepository } from "@bernouy/cms-content";
import { createContentReader } from "@bernouy/cms-content/rendering";
import { ContentDelivery, parseResolvePathRequest } from "@bernouy/cms-content/public-delivery";
import { InMemoryCache } from "@bernouy/http-runner";
import { NOOP_LOGGER } from "@bernouy/logging";
function fixture() {
    const repo = new InMemoryContentRepository();
    const delivery = new ContentDelivery({
        content: createContentReader(repo),
        cache: new InMemoryCache(),
        logger: NOOP_LOGGER,
        publicUrl: "https://site.test",
        resolveContributedAssets: async (value) => value,
        serveCollectionAsset: async (request) =>
            new Response(request.headers.get("range"), {
                status: request.headers.has("range") ? 206 : 200,
                headers: { "content-type": "text/plain" },
            }),
        pageCapabilities: { requiredAccess: async () => "admin" },
    });
    const read = (path: string, method = "GET", kind: "anonymous" | "administrator" = "anonymous", extra = {}) =>
        delivery.resolvePath(
            { path, method, query: [], ...extra },
            { kind, ...(kind === "administrator" ? { subjectId: "provider-alias" } : {}) },
        );
    return { repo, read };
}
test("Content owns system resources, bodyless HEAD and representation conditions", async () => {
    const { repo, read } = fixture();
    const settings = await repo.getSystem();
    await repo.updateSystem({ site: { ...settings.site, host: "https://canonical.test", name: "Site" } });
    expect(await (await read("/robots.txt")).text()).toContain("https://canonical.test/sitemap.xml");
    expect((await read("/sitemap.xml")).status).toBe(200);
    expect(await (await read("/manifest.webmanifest")).json()).toMatchObject({ name: "Site", start_url: "/" });
    const favicon = await read("/favicon.ico");
    const etag = favicon.headers.get("etag")!;
    expect(favicon.headers.get("content-type")).toBe("image/svg+xml");
    expect((await read("/favicon.ico", "HEAD")).body).toBeNull();
    const conditional = await read("/favicon.ico", "GET", "anonymous", { ifNoneMatch: etag });
    expect(conditional.status).toBe(304);
    expect(conditional.headers.get("content-type")).toBe("image/svg+xml");
    const asset = await read("/_content/collections/catalog/assets/a.svg", "GET", "anonymous", {
        range: { start: 1, end: 4 },
        ifRange: '"v1"',
    });
    expect(asset.status).toBe(206);
    expect(await asset.text()).toBe("bytes=1-4");
});
test("Content resolves redirects, gone Pages and missing routes without retaining provenance", async () => {
    const { repo, read } = fixture();
    await repo.insertPage("/old", "Page", "<p>Body</p>");
    let page = (await repo.getAllPages())[0]!;
    page = (await repo.updatePage({ id: page.id, visible: true }, page.revision))!;
    expect((await read("/old")).status).toBe(200);
    page = (await repo.updatePage({ id: page.id, path: "/new" }, page.revision))!;
    const redirect = await read("/old");
    expect(redirect.status).toBe(301);
    expect(redirect.headers.get("location")).toBe("/new");
    await repo.deletePage(page.id, page.revision);
    expect((await read("/new")).status).toBe(410);
    expect((await read("/missing")).status).toBe(404);
});
test("restricted system fallbacks cannot expose a Page to anonymous callers or a shared cache", async () => {
    const { repo, read } = fixture();
    await repo.insertPage(
        "/restricted",
        "Restricted",
        '<section cms-query="admin:read as value">Private fallback</section>',
    );
    const page = (await repo.getAllPages())[0]!;
    await repo.updatePage({ id: page.id, visible: true }, page.revision);
    const settings = await repo.getSystem();
    await repo.updateSystem({ site: { ...settings.site, notFound: { kind: "site", pageId: page.id } } });
    expect(await (await read("/missing")).text()).not.toContain("Private fallback");
    const allowed = await read("/missing", "GET", "administrator");
    expect(await allowed.text()).toContain("Private fallback");
    expect(allowed.headers.get("cache-control")).toBe("private, no-store");
});
test("protocol routes and unsupported authored authority never enter Content routing", async () => {
    const { read } = fixture();
    for (const path of ["/.cms/call/anything", "/healthz", "/readyz"]) {
        const result = await read(path, "HEAD");
        expect(result.status).toBe(404);
        expect(result.body).toBeNull();
    }
    for (const value of [
        { path: "/", method: "GET", query: [], cookies: "secret" },
        { path: "/", method: "POST", query: [] },
        { path: "/", method: "GET", query: [], range: {} },
        { path: "/../private", method: "GET", query: [] },
    ]) {
        expect(() => parseResolvePathRequest(value)).toThrow();
    }
});
