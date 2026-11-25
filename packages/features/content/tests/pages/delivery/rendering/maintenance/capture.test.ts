import { expect, test } from "bun:test";
import { InMemoryContentRepository } from "@bernouy/content";
import { createContentReader } from "@bernouy/content/rendering";
import { captureMaintenancePage, MAINTENANCE_HTML, MAINTENANCE_LIMITS } from "@bernouy/content/public-delivery";

async function fixture() {
    const repo = new InMemoryContentRepository();
    await repo.insertPage("/error", "Error", "<p>Error</p>");
    await repo.insertPage("/missing", "Missing", "<p>Missing</p>");
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
    const calls: string[] = [];
    const replies = new Map<string, () => Response>([
        [
            "/error",
            () =>
                new Response(
                    '<p>Old binary design</p><link rel="stylesheet" href="/old.css"><script>secret()</script><form><button>Send</button></form>',
                    { headers: { "content-type": "text/html" } },
                ),
        ],
        ["/missing", () => new Response("<p>Missing design</p>", { headers: { "content-type": "text/html" } })],
        [
            "/old.css",
            () => new Response(".error{background:url(/image.png)}", { headers: { "content-type": "text/css" } }),
        ],
        ["/image.png", () => new Response("image", { headers: { "content-type": "image/png" } })],
    ]);
    return {
        repo,
        calls,
        replies,
        pages,
        capture: (signal = AbortSignal.timeout(5000)) =>
            captureMaintenancePage(
                createContentReader(repo),
                "https://site.test",
                `/_content/maintenance/${"b".repeat(64)}`,
                async (path) => {
                    calls.push(path);
                    return replies.get(path)?.() ?? new Response(null, { status: 404 });
                },
                signal,
            ),
    };
}

test("source binary anonymous HTML and visual resources are frozen without scripts or active forms", async () => {
    const f = await fixture();
    const page = await f.capture();
    expect(page.html).toContain("Old binary design");
    expect(page.html).not.toContain("secret()");
    expect(page.html).toContain("inert");
    expect(page.resources).toHaveLength(2);
    expect(f.calls).toEqual(["/error", "/old.css", "/image.png"]);
});

test("anonymous denial and redirects cannot expose restricted Pages; hidden sites do not make public requests", async () => {
    const f = await fixture();
    f.replies.set("/error", () => new Response(null, { status: 302, headers: { location: "/login" } }));
    expect((await f.capture()).html).toContain("Missing design");
    expect(f.calls).not.toContain("/login");
    const settings = await f.repo.getSystem();
    await f.repo.updateSystem({ site: { ...settings.site, visible: false } });
    f.calls.length = 0;
    expect((await f.capture()).html).toBe(MAINTENANCE_HTML);
    expect(f.calls).toEqual([]);
});

test("signed resources, oversized HTML and missing public fallbacks remain generic", async () => {
    const f = await fixture();
    f.replies.set(
        "/error",
        () => new Response('<img src="/private?access=secret">', { headers: { "content-type": "text/html" } }),
    );
    expect((await f.capture()).html).toContain("Missing design");
    expect(f.calls).not.toContain("/private?access=secret");
    let cancelled = false;
    f.replies.set(
        "/error",
        () =>
            new Response(
                new ReadableStream({
                    start(controller) {
                        controller.enqueue(new Uint8Array(MAINTENANCE_LIMITS.bytes + 1));
                    },
                    cancel() {
                        cancelled = true;
                    },
                }),
                { headers: { "content-type": "text/html" } },
            ),
    );
    f.replies.set("/missing", () => new Response(null, { status: 403 }));
    expect((await f.capture()).html).toBe(MAINTENANCE_HTML);
    expect(cancelled).toBe(true);
    expect((await f.capture(AbortSignal.abort())).html).toBe(MAINTENANCE_HTML);
});
