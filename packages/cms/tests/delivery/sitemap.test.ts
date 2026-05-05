import { describe, test, expect } from "bun:test";
import SitemapServer from "src/delivery/endpoints/sitemap.xml.server";
import { makeDelivery, page, testRepository } from "./helpers";

function req(url = "https://example.com/sitemap.xml"): Request {
    return new Request(url);
}

describe("sitemap.xml (delivery)", () => {
    test("returns 200 with application/xml content type", async () => {
        const res = await SitemapServer(req(), makeDelivery());
        expect(res.status).toBe(200);
        expect(res.headers.get("Content-Type")).toBe("application/xml; charset=utf-8");
    });

    test("lists visible pages as absolute URLs from the request origin", async () => {
        const delivery = makeDelivery({
            repository: testRepository({
                pages: [
                    page({ path: "/about" }),
                    page({ path: "/contact" }),
                ],
            }),
        });
        const body = await (await SitemapServer(req("https://acme.io/sitemap.xml"), delivery)).text();
        expect(body).toContain("<loc>https://acme.io/about</loc>");
        expect(body).toContain("<loc>https://acme.io/contact</loc>");
    });

    test("excludes pages where visible is false", async () => {
        const delivery = makeDelivery({
            repository: testRepository({
                pages: [
                    page({ path: "/public" }),
                    page({ path: "/draft", visible: false }),
                ],
            }),
        });
        const body = await (await SitemapServer(req(), delivery)).text();
        expect(body).toContain("/public");
        expect(body).not.toContain("/draft");
    });

    test("defensively filters paths under cmsPathPrefix", async () => {
        const delivery = makeDelivery({
            repository: testRepository({
                pages: [
                    page({ path: "/about" }),
                    page({ path: "/.cms/leak" }),
                ],
            }),
        });
        const body = await (await SitemapServer(req(), delivery)).text();
        expect(body).toContain("/about");
        expect(body).not.toContain("/.cms/leak");
    });

    test("returns an empty urlset when no visible pages exist", async () => {
        const delivery = makeDelivery();
        const body = await (await SitemapServer(req(), delivery)).text();
        expect(body).toContain("<urlset");
        expect(body).toContain("</urlset>");
        expect(body).not.toContain("<url>");
    });
});
