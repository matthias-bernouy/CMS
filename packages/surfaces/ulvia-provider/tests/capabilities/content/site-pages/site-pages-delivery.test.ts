import { expect, test } from "bun:test";
import { createContentReader } from "@bernouy/content/rendering";
import { ContentDelivery } from "@bernouy/content/public-delivery";
import { InMemoryCache } from "@bernouy/http-runner";
import { NOOP_LOGGER } from "@bernouy/logging";
import { sitePagesFixture } from "./site-pages.fixture";

test("MCP-selected error and login Pages are used by public Content delivery", async () => {
    const f = await sitePagesFixture();
    await f.repository.createBloc({
        id: "fixture-system-page",
        name: "System Page",
        group: "",
        description: "",
        ownership: { kind: "code-managed" },
        kind: "component",
        markupHTML: "<slot></slot>",
        viewJS: "",
        root: { accepts: ["div"] },
        slots: { "": { accepts: [{ kind: "native-element", accepts: ["span"] }] } },
    });
    for (const [field, reference] of Object.entries(f.references)) {
        const page = (await f.repository.getPageById(reference.pageId))!;
        await f.repository.updatePage(
            {
                id: page.id,
                content: `<div cms-bloc="fixture-system-page"><span>Selected ${field}</span></div>`,
                visible: true,
            },
            page.revision,
        );
    }
    await f.repository.insertPage(
        "/private",
        "Private",
        '<div cms-bloc="fixture-system-page" cms-query="ulvia/admin:read as data"><span>Protected</span></div>',
    );
    const privatePage = (await f.repository.getPage("/private"))!;
    await f.repository.updatePage({ id: privatePage.id, visible: true }, privatePage.revision);
    expect((await f.call("update", { expectedRevision: 0, ...f.references })).isError).toBeUndefined();

    const delivery = new ContentDelivery({
        content: createContentReader(f.repository),
        cache: new InMemoryCache(),
        logger: NOOP_LOGGER,
        publicUrl: "https://site.test",
        resolveContributedAssets: async (value) => value,
        serveCollectionAsset: async () => new Response(null, { status: 404 }),
        pageCapabilities: { requiredAccess: async () => "admin" },
    });
    const missing = await delivery.resolvePath({ path: "/missing", method: "GET", query: [] }, { kind: "anonymous" });
    expect(missing.status).toBe(404);
    expect(await missing.text()).toContain("Selected notFound");
    const forbidden = await delivery.resolvePath(
        { path: "/private", method: "GET", query: [] },
        { kind: "user", subjectId: "member" },
    );
    expect(forbidden.status).toBe(403);
    expect(await forbidden.text()).toContain("Selected forbidden");
    const login = await delivery.resolvePath({ path: "/private", method: "GET", query: [] }, { kind: "anonymous" });
    expect(login.status).toBe(302);
    expect(login.headers.get("location")).toBe("/login?returnTo=%2Fprivate");
    const loginPage = await delivery.resolvePath({ path: "/login", method: "GET", query: [] }, { kind: "anonymous" });
    expect(loginPage.status).toBe(200);
    expect(await loginPage.text()).toContain("Selected login");

    await f.call("update", { expectedRevision: 1, notFound: null, login: null });
    const cleared = await delivery.resolvePath({ path: "/missing", method: "GET", query: [] }, { kind: "anonymous" });
    expect(cleared.status).toBe(404);
    expect(await cleared.text()).toBe("Page not found");
    const noLogin = await delivery.resolvePath({ path: "/private", method: "GET", query: [] }, { kind: "anonymous" });
    expect(noLogin.status).toBe(503);
});
