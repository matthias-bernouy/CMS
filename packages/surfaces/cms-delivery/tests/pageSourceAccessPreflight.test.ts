import { describe, expect, test } from "bun:test";
import { InMemoryRolesRepository, PUBLIC_ROLE, USER_ROLE } from "@bernouy/cms-permissions";
import { authSubject, mountPage } from "./pageSourceAccessPreflight.fixture";

describe("Delivery page source access preflight", () => {
    test("redirects anonymous visitors when an auto source is not granted", async () => {
        const { handler } = await mountPage({
            content: `<section cms-source="/.cms/sources/shop/listProducts as products"><p>Products</p></section>`,
            auth: authSubject(null),
        });

        const res = await handler(new Request("http://site/products?category=shoes"));

        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toBe("/login?returnTo=%2Fproducts%3Fcategory%3Dshoes");
    });

    test("redirects anonymous visitors to the configured login page", async () => {
        const { handler } = await mountPage({
            content: `<section cms-source="/.cms/sources/shop/listProducts as products"><p>Products</p></section>`,
            auth: authSubject(null),
            systemPages: { login: { path: "/sign-in" } },
        });

        const res = await handler(new Request("http://site/products?category=shoes"));

        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toBe("/sign-in?returnTo=%2Fproducts%3Fcategory%3Dshoes");
    });

    test("returns 403 when an authenticated visitor lacks the auto source grant", async () => {
        const { handler } = await mountPage({
            content: `<section cms-source="/.cms/sources/shop/listProducts as products"><p>Products</p></section>`,
            auth: authSubject({ identifier: "user-1", role: USER_ROLE }),
        });

        const res = await handler(new Request("http://site/products"));

        expect(res.status).toBe(403);
        expect(await res.text()).toBe("Forbidden");
    });

    test("renders the configured forbidden page with status 403", async () => {
        const { handler } = await mountPage({
            content: `<section cms-source="/.cms/sources/shop/listProducts as products"><p>Forbidden page</p></section>`,
            auth: authSubject({ identifier: "user-1", role: USER_ROLE }),
            systemPages: { forbidden: { path: "/forbidden" } },
        });

        const res = await handler(new Request("http://site/products"));

        expect(res.status).toBe(403);
        expect(await res.text()).toContain("Forbidden page");
    });

    test("serves the page when the visitor role can access every auto source", async () => {
        const roles = new InMemoryRolesRepository();
        await roles.upsert({
            id: PUBLIC_ROLE,
            label: "Public",
            builtin: true,
            grants: [{ permission: "urn:shop:listProducts" }],
        });
        const { handler } = await mountPage({
            content: `<section cms-source="/.cms/sources/shop/listProducts as products"><p>Products</p></section>`,
            roles,
            auth: authSubject(null),
        });

        const res = await handler(new Request("http://site/products"));

        expect(res.status).toBe(200);
        expect(await res.text()).toContain("Products");
    });

    test("does not block initial page rendering for submit sources", async () => {
        const { handler } = await mountPage({
            content: `<form cms-source="/.cms/sources/shop/createOrder" cms-source-method="post" cms-source-trigger="submit"><button>Buy</button></form>`,
            auth: authSubject(null),
        });

        const res = await handler(new Request("http://site/checkout"));

        expect(res.status).toBe(200);
        expect(await res.text()).toContain("Buy");
    });

    test("runs source access checks before serving a cached page", async () => {
        const roles = new InMemoryRolesRepository();
        await roles.upsert({
            id: PUBLIC_ROLE,
            label: "Public",
            builtin: true,
            grants: [{ permission: "urn:shop:listProducts" }],
        });
        const { handler } = await mountPage({
            content: `<section cms-source="/.cms/sources/shop/listProducts as products"><p>Products</p></section>`,
            roles,
            auth: authSubject(null),
        });

        expect((await handler(new Request("http://site/products"))).status).toBe(200);

        await roles.upsert({
            id: PUBLIC_ROLE,
            label: "Public",
            builtin: true,
            grants: [],
        });
        const denied = await handler(new Request("http://site/products"));

        expect(denied.status).toBe(302);
    });
});
