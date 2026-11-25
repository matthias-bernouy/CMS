import { expect, test } from "bun:test";
import { freezeMaintenanceResources } from "content/pages/delivery/maintenance/resources";
import { MAINTENANCE_LIMITS } from "@bernouy/content/public-delivery";

const prefix = `/_content/maintenance/${"a".repeat(64)}`;
const signal = () => AbortSignal.timeout(5000);
test("freezes CSS imports, fonts, relative images and SVG fragments with coalesced reads", async () => {
    const calls: string[] = [];
    const bodies: Record<string, [string, string]> = {
        "/style/main.css": [
            '@import "parts/colors.css";@font-face{src:url(../font.woff2)}.error{background:url(../image.png)}',
            "text/css",
        ],
        "/style/parts/colors.css": [".error{color:red}", "text/css"],
        "/font.woff2": ["font", "font/woff2"],
        "/image.png": ["image", "image/png"],
        "/icons.svg": ["<svg/>", "image/svg+xml"],
    };
    const result = await freezeMaintenanceResources(
        '<html><head><link rel="stylesheet" href="/style/main.css"></head><body><section cms-bloc="site-error" class="error"><img src="../image.png"><img srcset="../image.png 1x, ../image.png 2x"><svg><use href="/icons.svg#mark"/></svg></section><img src="https://cdn.test/image.png"><script src="/live.js"></script><form><button>Submit</button></form></body></html>',
        "https://site.test/nested/error",
        prefix,
        async (path) => {
            calls.push(path);
            const [body, type] = bodies[path]!;
            return new Response(body, { headers: { "content-type": type } });
        },
        signal(),
    );
    expect(calls).toEqual(["/style/main.css", "/image.png", "/icons.svg", "/style/parts/colors.css", "/font.woff2"]);
    expect(result.resources).toHaveLength(5);
    expect(new TextDecoder().decode(result.resources[0]!.bytes)).toContain(`${prefix}/4`);
    expect(result.html).toContain('cms-bloc="site-error"');
    expect(result.html).toContain(`${prefix}/2#mark`);
    expect(result.html).toContain("https://cdn.test/image.png");
    expect(result.html).not.toContain("live.js");
    expect(result.html).toContain("inert");
});

test("oversized streams are cancelled and too many dependencies stop before reading", async () => {
    let cancelled = false;
    await expect(
        freezeMaintenanceResources(
            '<img src="/image">',
            "https://site.test/error",
            prefix,
            async () =>
                new Response(
                    new ReadableStream({
                        start(controller) {
                            controller.enqueue(new Uint8Array(MAINTENANCE_LIMITS.resourceBytes + 1));
                        },
                        cancel() {
                            cancelled = true;
                        },
                    }),
                    { headers: { "content-type": "image/png" } },
                ),
            signal(),
        ),
    ).rejects.toThrow("byte limit");
    expect(cancelled).toBe(true);
    let reads = 0;
    await expect(
        freezeMaintenanceResources(
            Array.from({ length: MAINTENANCE_LIMITS.resources + 1 }, (_, index) => `<img src="/${index}">`).join(""),
            "https://site.test/error",
            prefix,
            async () => {
                reads++;
                return new Response();
            },
            signal(),
        ),
    ).rejects.toThrow("resource limit");
    expect(reads).toBe(0);
});

test("HTML, unavailable dependencies and invalid asset prefixes are refused", async () => {
    for (const response of [
        new Response("<html>", { headers: { "content-type": "text/html" } }),
        new Response(null, { status: 403 }),
    ]) {
        await expect(
            freezeMaintenanceResources(
                '<img src="/private">',
                "https://site.test/error",
                prefix,
                async () => response,
                signal(),
            ),
        ).rejects.toThrow();
    }
    await expect(
        freezeMaintenanceResources(
            "<p>Page</p>",
            "https://site.test/error",
            "//foreign.test",
            async () => new Response(),
            signal(),
        ),
    ).rejects.toThrow("prefix");
});

test("aborting a stalled stream cancels the resource and releases preparation", async () => {
    const abort = new AbortController();
    const entered = Promise.withResolvers<void>();
    let cancelled = false;
    const pending = freezeMaintenanceResources(
        '<img src="/image">',
        "https://site.test/error",
        prefix,
        async () =>
            new Response(
                new ReadableStream({
                    pull() {
                        entered.resolve();
                    },
                    cancel() {
                        cancelled = true;
                    },
                }),
                { headers: { "content-type": "image/png" } },
            ),
        abort.signal,
    );
    await entered.promise;
    abort.abort();
    await expect(pending).rejects.toThrow();
    expect(cancelled).toBe(true);
});

test("inline image srcsets stay inline without allocating spurious resources", async () => {
    const html =
        '<html><body><img srcset="data:image/png;base64,AAAA 1x, data:image/png;base64,BBBB 2x"></body></html>';
    const frozen = await freezeMaintenanceResources(
        html,
        "https://site.test/error",
        prefix,
        async () => {
            throw new Error("No local read expected");
        },
        signal(),
    );
    expect(frozen.html).toContain('srcset="data:image/png;base64,AAAA 1x, data:image/png;base64,BBBB 2x"');
    expect(frozen.resources).toHaveLength(0);
});
