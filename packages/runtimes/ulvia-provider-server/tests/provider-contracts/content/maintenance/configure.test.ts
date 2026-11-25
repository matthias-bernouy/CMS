import { expect, test } from "bun:test";
import { InMemoryContentRepository } from "@bernouy/content";
import { NOOP_LOGGER } from "@bernouy/logging";
import { configureMaintenancePages } from "../../../../src/runtime/content/maintenance/configure";
import { gatewayRoute } from "../../../../../../../tests/integration/gateway/fixtures";
import { fixture, id, request } from "./fixture";
import type { GatewayInvocation } from "@bernouy/cms-gateway";

test("runtime preparation preserves public SVG binding identity and immutable response headers", async () => {
    const f = fixture();
    const repo = new InMemoryContentRepository();
    const route = await gatewayRoute({ binary: true });
    const calls: GatewayInvocation[] = [];
    await repo.insertPage(
        "/error",
        "Error",
        '<section><h1>Our design</h1><svg cms-svg="/.cms/call/ulvia/catalog/v1/files/check" role="img"></svg></section>',
    );
    const page = (await repo.getAllPages())[0]!;
    await repo.updatePage({ id: page.id, visible: true }, page.revision);
    const settings = await repo.getSystem();
    await repo.updateSystem({ site: { ...settings.site, visible: true, serverError: { pageId: page.id } } });
    configureMaintenancePages(
        { repo, maintenancePages: f.pages, collections: {}, logger: NOOP_LOGGER } as never,
        {
            siteId: "site",
            routes: { resolve: async () => route },
            resolvePageCapability: async () => ({ access: "public", version: "1.0.0" }),
            invoker: {
                invoke: async (input: GatewayInvocation) => {
                    calls.push(input);
                    return {
                        kind: "binary",
                        requestId: "svg",
                        contentType: "image/svg+xml",
                        responseHeaders: { etag: '"v1"', "cache-control": "public, immutable" },
                        stream: new Response('<svg viewBox="0 0 24 24"><path d="M0 0"></path></svg>').body!,
                    };
                },
            },
        } as never,
        "https://site.test",
    );
    await f.pages.prepare("site", id);
    const html = await (await f.pages.page(request(), id))!.text();
    expect(html).toContain("Our design");
    expect(html).toContain('d="M0 0"');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ siteId: "site", actor: { kind: "anonymous" }, bindingId: "http" });
});
