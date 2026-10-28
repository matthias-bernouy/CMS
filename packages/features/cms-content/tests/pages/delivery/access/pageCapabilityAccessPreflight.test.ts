import { describe, expect, test } from "bun:test";
import { authSubject, mountPage } from "./pageCapabilityAccessPreflight.fixture";

describe("Content page capability access preflight", () => {
    test("requires authentication for otherwise public Pages on a private site", async () => {
        const anonymous = await mountPage({
            content: "<p>Members only</p>",
            siteVisible: false,
            resolveActor: authSubject(null),
        });
        const response = await anonymous.handler(new Request("http://site/products"));
        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toBe("/login?returnTo=%2Fproducts");
        expect(response.headers.get("cache-control")).toBe("no-store");

        const member = await mountPage({
            content: "<p>Members only</p>",
            siteVisible: false,
            resolveActor: authSubject({ identifier: "member-1" }),
        });
        const memberResponse = await member.handler(new Request("http://site/products"));
        expect(memberResponse.status).toBe(200);
        expect(memberResponse.headers.get("cache-control")).toBe("private, no-store");
        expect(await memberResponse.text()).toContain("noindex,follow");
    });

    test("keeps the configured login Page reachable on a private site", async () => {
        const { handler } = await mountPage({
            content: "<p>Sign in</p>",
            pageId: "sign-in",
            pagePath: "/sign-in",
            siteVisible: false,
            resolveActor: authSubject(null),
            systemPages: { login: { kind: "site", pageId: "sign-in" } },
        });

        const response = await handler(new Request("http://site/sign-in"));
        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("private, no-store");
    });

    test("redirects anonymous visitors when a query capability requires authentication", async () => {
        const { handler } = await mountPage({
            content: `<section cms-query="shop:my-products as products"><p>Products</p></section>`,
            resolveActor: authSubject(null),
        });

        const response = await handler(new Request("http://site/products?category=shoes"));
        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toBe("/login?returnTo=%2Fproducts%3Fcategory%3Dshoes");
    });

    test("uses the configured login page", async () => {
        const { handler } = await mountPage({
            content: `<section cms-query="shop:my-products as products"></section>`,
            resolveActor: authSubject(null),
            systemPages: { login: { kind: "site", pageId: "sign-in" } },
        });

        const response = await handler(new Request("http://site/products"));
        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toBe("/sign-in?returnTo=%2Fproducts");
    });

    test("uses a configured site login Page", async () => {
        const { handler } = await mountPage({
            content: `<section cms-query="shop:my-products as products"></section>`,
            resolveActor: authSubject(null),
            systemPages: {
                login: {
                    kind: "site",
                    pageId: "login",
                },
            },
        });

        const response = await handler(new Request("http://site/products"));
        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toBe("/login?returnTo=%2Fproducts");
    });

    test("serves public capabilities anonymously and authenticated capabilities to members", async () => {
        const publicPage = await mountPage({
            content: `<section cms-query="shop:list-products as products"><p>Public</p></section>`,
            resolveActor: authSubject(null),
        });
        expect((await publicPage.handler(new Request("http://site/products"))).status).toBe(200);

        const memberPage = await mountPage({
            content: `<section cms-query="shop:my-products as products"><p>Private</p></section>`,
            resolveActor: authSubject({ identifier: "member-1" }),
        });
        expect((await memberPage.handler(new Request("http://site/products"))).status).toBe(200);
    });

    test("requires authentication even when the capability is triggered on submit", async () => {
        const { handler } = await mountPage({
            content: `<form cms-mutation="shop:create-order as order"><button>Buy</button></form>`,
            pagePath: "/checkout",
            resolveActor: authSubject(null),
        });
        const response = await handler(new Request("http://site/checkout"));
        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toBe("/login?returnTo=%2Fcheckout");
    });

    test("forbids a verified user when the gateway host grant denies access", async () => {
        const { handler } = await mountPage({
            content: `<section cms-query="shop:restricted as restricted"></section>`,
            resolveActor: authSubject({ identifier: "member-1" }),
        });
        const response = await handler(new Request("http://site/products"));
        expect(response.status).toBe(403);
    });
});
