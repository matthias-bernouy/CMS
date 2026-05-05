import { describe, test, expect } from "bun:test";
import RobotsServer from "src/delivery/endpoints/robots.txt.server";
import { makeDelivery } from "./helpers";

function req(url = "https://example.com/robots.txt"): Request {
    return new Request(url);
}

describe("robots.txt (delivery)", () => {
    test("returns 200 with text/plain content type", async () => {
        const res = await RobotsServer(req(), makeDelivery());
        expect(res.status).toBe(200);
        expect(res.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    });

    test("declares User-agent and Allow", async () => {
        const body = await (await RobotsServer(req(), makeDelivery())).text();
        expect(body).toContain("User-agent: *");
        expect(body).toContain("Allow: /");
    });

    test("Disallow line uses cmsPathPrefix", async () => {
        const body = await (await RobotsServer(req(), makeDelivery())).text();
        expect(body).toContain("Disallow: /.cms/");
    });

    test("Sitemap line uses basePath + /sitemap.xml, absolute from request origin", async () => {
        const body = await (await RobotsServer(req("https://acme.io/robots.txt"), makeDelivery())).text();
        expect(body).toContain("Sitemap: https://acme.io/sitemap.xml");
    });

    test("tenant-scoped delivery: Disallow and Sitemap pick up the tenant basePath", async () => {
        const delivery = makeDelivery({ basePath: "/tenant-1" });
        const body = await (await RobotsServer(req("https://acme.io/tenant-1/robots.txt"), delivery)).text();
        expect(body).toContain("Disallow: /tenant-1/.cms/");
        expect(body).toContain("Sitemap: https://acme.io/tenant-1/sitemap.xml");
    });
});
