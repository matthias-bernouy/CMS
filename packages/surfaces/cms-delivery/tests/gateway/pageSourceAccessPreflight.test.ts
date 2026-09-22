import { describe, expect, test } from "bun:test";
import { authSubject, mountPage } from "./pageSourceAccessPreflight.fixture";

describe("Delivery page source access preflight", () => {
    test("redirects anonymous visitors when an automatic source requires authentication", async () => {
        const { handler } = await mountPage({
            content: `<section cms-source="/.cms/sources/shop/myProducts as products"><p>Products</p></section>`,
            auth: authSubject(null),
        });

        const response = await handler(new Request("http://site/products?category=shoes"));
        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toBe("/login?returnTo=%2Fproducts%3Fcategory%3Dshoes");
    });

    test("uses the configured login page", async () => {
        const { handler } = await mountPage({
            content: `<section cms-source="/.cms/sources/shop/myProducts as products"></section>`,
            auth: authSubject(null),
            systemPages: { login: { path: "/sign-in" } },
        });

        const response = await handler(new Request("http://site/products"));
        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toBe("/sign-in?returnTo=%2Fproducts");
    });

    test("serves public sources anonymously and authenticated sources to members", async () => {
        const publicPage = await mountPage({
            content: `<section cms-source="/.cms/sources/shop/listProducts as products"><p>Public</p></section>`,
            auth: authSubject(null),
        });
        expect((await publicPage.handler(new Request("http://site/products"))).status).toBe(200);

        const memberPage = await mountPage({
            content: `<section cms-source="/.cms/sources/shop/myProducts as products"><p>Private</p></section>`,
            auth: authSubject({ identifier: "member-1" }),
        });
        expect((await memberPage.handler(new Request("http://site/products"))).status).toBe(200);
    });

    test("does not block initial page rendering for submit sources", async () => {
        const { handler } = await mountPage({
            content: `<form cms-source="/.cms/sources/shop/createOrder" cms-source-method="post" cms-source-trigger="submit"><button>Buy</button></form>`,
            auth: authSubject(null),
        });
        const response = await handler(new Request("http://site/checkout"));
        expect(response.status).toBe(200);
        expect(await response.text()).toContain("Buy");
    });
});
