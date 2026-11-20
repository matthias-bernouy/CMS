import { expect, test } from "bun:test";
import { bundleCaptureResources } from "content/application/captures/resources";
test("resource bundles preserve queries, resolve nested CSS and never fetch external origins", async () => {
    const reads: string[] = [];
    const document = await bundleCaptureResources(
        '<html><head><link rel="stylesheet" href="/_content/style?v=abc"></head><body><img src="https://outside.invalid/secret"><img src="https://site.test/_content/photo"></body></html>',
        "https://site.test",
        "/page",
        async (path) => {
            reads.push(path);
            return path.startsWith("/_content/style")
                ? new Response('body{background:url("font.woff2")} @import "nested.css"', {
                      headers: { "content-type": "text/css" },
                  })
                : new Response("bytes");
        },
    );
    expect(reads).toContain("/_content/style?v=abc");
    expect(reads).toContain("/_content/font.woff2");
    expect(reads).toContain("/_content/nested.css");
    expect(reads.some((path) => path.includes("outside"))).toBeFalse();
    expect(document.files.has("_content/style?v=abc")).toBeTrue();
    expect(document.origin).toBe("https://site.test");
    expect(await document.files.get(document.path)!.text()).toContain("https://site.test/_content/photo");
});
test("bundling preserves visible URLs, inline scripts and CSS text instead of rewriting the document", async () => {
    const html =
        '<link rel="stylesheet" href="/style.css"><p>https://site.test</p><script>window.expected="https://site.test";</script>';
    const css = 'body::after{content:"https://site.test"}body{background:url(https://site.test/image.png)}';
    const document = await bundleCaptureResources(html, "https://site.test", "/page", async (path) =>
        path === "/style.css" ? new Response(css, { headers: { "content-type": "text/css" } }) : new Response("image"),
    );
    expect(await document.files.get(document.path)!.text()).toBe(html);
    expect(await document.files.get("style.css")!.text()).toBe(css);
    expect(document.files.has("image.png")).toBeTrue();
});
test("resource limits cancel a streamed body instead of retaining unbounded data", async () => {
    let cancelled = false;
    let count = 0;
    await expect(
        bundleCaptureResources(
            '<img src="/_content/huge">',
            "https://site.test",
            "/page",
            async () =>
                new Response(
                    new ReadableStream({
                        pull(controller) {
                            controller.enqueue(new Uint8Array(1024 * 1024));
                            count++;
                        },
                        cancel() {
                            cancelled = true;
                        },
                    }),
                ),
        ),
    ).rejects.toThrow("LIMIT_EXCEEDED");
    expect(cancelled).toBeTrue();
    expect(count).toBeLessThan(70);
});

test("Unicode Page entries retain their URL path and decoded resource key", async () => {
    const document = await bundleCaptureResources(
        "<p>Café</p>",
        "https://site.test",
        "/café",
        async () => new Response(null, { status: 404 }),
    );
    expect(document.path).toBe("caf%C3%A9");
    expect(await document.files.get("café")!.text()).toBe("<p>Café</p>");
});

test("the root Page retains its exact URL and relative-resource base instead of becoming index.html", async () => {
    const html = '<script>window.path=location.pathname</script><img src="photo.png">';
    const document = await bundleCaptureResources(html, "https://site.test", "/", async () => new Response("image"));
    expect(document.path).toBe("");
    expect(await document.files.get("")!.text()).toBe(html);
    expect(document.files.has("photo.png")).toBeTrue();
});
