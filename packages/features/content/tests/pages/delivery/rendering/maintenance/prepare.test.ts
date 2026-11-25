import { expect, test } from "bun:test";
import { InMemoryContentRepository } from "@bernouy/content";
import { createContentReader } from "@bernouy/content/rendering";
import { prepareMaintenancePage, MAINTENANCE_HTML } from "@bernouy/content/public-delivery";
import { InMemoryCache } from "@bernouy/http-runner";
import { NOOP_LOGGER } from "@bernouy/logging";

const prefix = `/_content/maintenance/${"a".repeat(64)}`;
async function fixture(errorContent = '<section class="error">Under maintenance</section>') {
    const repo = new InMemoryContentRepository();
    await repo.insertPage("/error", "Our error Page", errorContent);
    await repo.insertPage("/missing", "Our missing Page", "<p>Our missing design</p>");
    const pages = await repo.getAllPages();
    for (const page of pages) {
        await repo.updatePage({ id: page.id, visible: true }, page.revision);
    }
    const settings = await repo.getSystem();
    await repo.updateSystem({
        site: {
            ...settings.site,
            visible: true,
            serverError: { pageId: pages[0]!.id },
            notFound: { pageId: pages[1]!.id },
        },
    });
    const options = {
        content: createContentReader(repo),
        cache: new InMemoryCache(),
        logger: NOOP_LOGGER,
        publicUrl: "https://site.test",
        resolveContributedAssets: async (value: string) => value,
        serveCollectionAsset: async () => new Response(null, { status: 404 }),
        pageCapabilities: { requiredAccess: async () => "admin" as const },
    };
    return {
        repo,
        options,
        error: pages[0]!,
        missing: pages[1]!,
        prepare: () => prepareMaintenancePage(options, prefix, AbortSignal.timeout(5000)),
    };
}

test("freezes the published serverError design with its CSS and without browser execution", async () => {
    const f = await fixture();
    const result = await f.prepare();
    expect(result.html).toContain("Under maintenance");
    expect(result.html).not.toContain("Our missing design");
    expect(result.html).toContain(`${prefix}/`);
    expect(result.resources.some((resource) => resource.contentType.startsWith("text/css"))).toBe(true);
    expect(result.html).not.toContain("<script");
    expect(result.html).not.toContain("canonical");
    expect(result.html).toContain('content="noindex, nofollow"');
    await f.repo.updatePage({ id: f.error.id, content: "<p>New design</p>" }, f.error.revision + 1);
    expect(result.html).toContain("Under maintenance");
});

test("missing or unpublished serverError falls back to the published notFound design", async () => {
    const f = await fixture();
    await f.repo.updatePage({ id: f.error.id, visible: false }, f.error.revision + 1);
    const result = await f.prepare();
    expect(result.html).toContain("Our missing design");
    expect(result.html).not.toContain("Under maintenance");
});

test("restricted Pages and unavailable visual resources cannot enter the shared snapshot", async () => {
    const f = await fixture('<section cms-query="ulvia/admin:read as result">Private design</section>');
    expect((await f.prepare()).html).toContain("Our missing design");
    await f.repo.updatePage({ id: f.missing.id, visible: false }, f.missing.revision + 1);
    expect((await f.prepare()).html).toBe(MAINTENANCE_HTML);
    const broken = await fixture('<img src="/.cms/call/ulvia/cms.files/files/secret/generation?access=private">');
    expect((await broken.prepare()).html).toContain("Our missing design");
});

test("a hidden site and an aborted preparation use the integrated HTML fallback", async () => {
    const f = await fixture();
    expect((await prepareMaintenancePage(f.options, prefix, AbortSignal.abort())).html).toBe(MAINTENANCE_HTML);
    const settings = await f.repo.getSystem();
    await f.repo.updateSystem({ site: { ...settings.site, visible: false } });
    expect((await f.prepare()).html).toBe(MAINTENANCE_HTML);
});
