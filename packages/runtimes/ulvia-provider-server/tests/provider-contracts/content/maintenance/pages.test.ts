import { expect, test } from "bun:test";
import { MAINTENANCE_HTML, MAINTENANCE_LIMITS } from "@bernouy/content/public-delivery";
import { fixture, id, assetPath, request } from "./fixture";

test("cold instances serve the exact frozen HTML and projected resource without rendering again", async () => {
    const f = fixture();
    await f.pages.init();
    f.pages.configure(async () => ({
        html: `<html><link rel="stylesheet" href="${assetPath}">Original visual</html>`,
        resources: [{ contentType: "text/css", bytes: new TextEncoder().encode(".error{color:red}") }],
    }));
    await f.pages.prepare("site", id);
    const reopened = f.reopen();
    const page = (await reopened.page(request(), id))!;
    expect(page.status).toBe(503);
    expect(page.headers.get("content-type")).toContain("text/html");
    expect(page.headers.get("retry-after")).toBe("60");
    expect(page.headers.get("cache-control")).toBe("no-store");
    expect(await page.text()).toContain("Original visual");
    expect(await (await reopened.resource(request(assetPath)))!.text()).toBe(".error{color:red}");
    expect(f.reads.slice(-2).map(({ projection }) => projection)).toEqual([
        { html: 1 },
        { html: 0, expiresAt: 0, _id: 0, resources: { $slice: [0, 1] } },
    ]);
    expect((await reopened.page(request("/", "HEAD"), id))!.body).toBeNull();
    expect((await reopened.resource(request(assetPath, "HEAD")))!.body).toBeNull();
    expect(f.indexes).toEqual([{ keys: { expiresAt: 1 }, options: { expireAfterSeconds: 0 } }]);
});

test("scope and malformed paths refuse without exposing another site's snapshot", async () => {
    const f = fixture();
    await f.pages.prepare("site", id);
    expect(() => f.pages.prepare("foreign", id)).toThrow("scope");
    expect((await f.reopen("foreign").page(request(), id))!.status).toBe(503);
    expect(await (await f.reopen("foreign").page(request(), id))!.text()).toBe(MAINTENANCE_HTML);
    const reads = f.reads.length;
    for (const path of ["/_content/maintenance/invalid/0", `${assetPath}0`, assetPath.replace("/0", "/64")]) {
        expect((await f.pages.resource(request(path)))!.status).toBe(404);
    }
    expect(f.reads).toHaveLength(reads);
    expect(await f.pages.resource(request("/article"))).toBeNull();
    expect(await f.pages.page(request("/sitemap.xml"), id)).toBeNull();
});

test("preparations coalesce, bound concurrency, preserve retries and retain assets until cleanup", async () => {
    const f = fixture();
    const gate = Promise.withResolvers<void>();
    let renders = 0;
    f.pages.configure(async () => {
        renders++;
        await gate.promise;
        return { html: "Frozen", resources: [] };
    });
    const first = f.pages.prepare("site", id);
    const second = f.pages.prepare("site", id);
    await expect(f.pages.prepare("site", `sha256:${"b".repeat(64)}`)).rejects.toMatchObject({ status: 423 });
    gate.resolve();
    await Promise.all([first, second]);
    await f.pages.prepare("site", id);
    expect(renders).toBe(1);
    expect([...f.rows.values()][0]!.expiresAt).toBeUndefined();
    await f.pages.retire("site", id);
    expect([...f.rows.values()][0]!.expiresAt!.getTime()).toBeGreaterThan(Date.now() + 86_000_000);
});

test("failed and oversized preparation does not publish a partial snapshot", async () => {
    const f = fixture();
    f.pages.configure(async () => ({ html: "a".repeat(MAINTENANCE_LIMITS.bytes + 1), resources: [] }));
    await expect(f.pages.prepare("site", id)).rejects.toThrow("byte limit");
    expect(f.rows.size).toBe(0);
    f.pages.configure(async () => ({ html: "Retry", resources: [] }));
    await f.pages.prepare("site", id);
    expect(f.rows.size).toBe(1);
});

test("contract maintenance negotiates built-in defaults after reopening, keeping authored snapshots intact", async () => {
    const f = fixture();
    await f.pages.prepare("site", id);
    const reopened = f.reopen();
    for (const method of ["GET", "HEAD"]) {
        const input = new Request("https://site.test/article", {
            method,
            headers: { "accept-language": "en;q=0.5,fr-CA;q=0.9" },
        });
        const before = f.reads.length;
        const response = (await reopened.page(input, id))!;
        expect(f.reads.length - before).toBe(1);
        expect(response.status).toBe(503);
        expect(response.headers.get("content-language")).toBe("fr");
        expect(response.headers.get("vary")).toBe("Accept-Language");
        if (method === "HEAD") {
            expect(response.body).toBeNull();
        } else {
            expect(await response.text()).toContain("Site indisponible");
        }
    }
    const row = [...f.rows.values()][0]!;
    row.html = "<html>Custom snapshot</html>";
    const custom = (await reopened.page(
        new Request("https://site.test/article", { headers: { "accept-language": "fr" } }),
        id,
    ))!;
    expect(await custom.text()).toBe(row.html);
});
