import { expect, test } from "bun:test";
import type { TPage } from "@bernouy/cms-content/rendering";
import { PageExecutionService } from "@bernouy/cms-gateway/execution";

const page: TPage = {
    id: "products",
    revision: 4,
    path: "/products",
    title: "Products",
    description: "",
    content: `<form cms-source="/.cms/call/shop/products as products" cms-source-method="post"></form>`,
    visible: true,
    tags: [],
};

test("Page execution resolves sources to exact capabilities before classifying access", async () => {
    const activated: unknown[] = [];
    const service = new PageExecutionService({
        siteId: "site-a",
        content: { getRenderablePage: async () => null },
        invoker: {
            resolveHttp: async ({ contractId, method, path }) => {
                expect({ contractId, method, path }).toEqual({
                    contractId: "shop",
                    method: "POST",
                    path: "/products",
                });
                return { capability: { id: "listProducts" }, binding: {}, pathValues: {} };
            },
        },
        authority: {
            activate: async (input) => {
                activated.push(input);
                return {} as never;
            },
            authorize: async () => ({ planDigest: "sha256:plan", version: "2.3.0" }) as never,
        },
        resolveCapability: async (contractId, capabilityId) => {
            if (contractId === "shop" && capabilityId === "listProducts") {
                return { access: "authenticated", version: "2.3.0" };
            }
            return contractId === "search" && capabilityId === "read" ? { access: "public", version: "1.4.0" } : null;
        },
    });

    const selected = {
        page,
        requirements: [{ contractId: "search", capabilityId: "read", versionRange: "^1.0.0" }],
    };
    const access = await service.requiredAccess(selected, new URL("https://example.test/products"), "/.cms/call/");
    expect(access).toBe("authenticated");
    expect(
        await service.resolveRequirements(selected, new URL("https://example.test/products"), "/.cms/call/"),
    ).toEqual([
        { contractId: "search", capabilityId: "read", versionRange: "^1.0.0" },
        { contractId: "shop", capabilityId: "listProducts", versionRange: "=2.3.0" },
    ]);
    expect(activated).toEqual([]);
});

test("Page calls activate the complete exact plan of the same-origin referring Page", async () => {
    const activations: unknown[] = [];
    const authorizations: unknown[] = [];
    const selected = {
        reference: { kind: "site" as const, pageId: "products" },
        page,
        source: { kind: "site" as const, pageId: "products", revision: 4 },
        requirements: [],
    };
    const service = new PageExecutionService({
        siteId: "site-a",
        content: { getRenderablePage: async (path) => (path === "/products" ? selected : null) },
        invoker: {
            resolveHttp: async () => ({ capability: { id: "listProducts" }, binding: {}, pathValues: {} }),
        },
        authority: {
            activate: async (input) => {
                activations.push(input);
                return {} as never;
            },
            authorize: async (input) => {
                authorizations.push(input);
                return { planDigest: "sha256:plan", version: "2.3.0" } as never;
            },
        },
        resolveCapability: async () => ({ access: "public", version: "2.3.0" }),
    });

    await service.authorizeCall(
        new Request("https://example.test/.cms/call/shop/products", {
            headers: { referer: "https://example.test/products" },
        }),
        "/",
        "shop",
        "listProducts",
    );

    expect(activations).toEqual([
        {
            consumer: { kind: "site", siteId: "site-a", pageId: "products", pageRevision: 4 },
            requirements: [{ contractId: "shop", capabilityId: "listProducts", versionRange: "=2.3.0" }],
        },
    ]);
    expect(authorizations).toEqual([
        {
            kind: "site",
            siteId: "site-a",
            pageId: "products",
            pageRevision: 4,
            contractId: "shop",
            capabilityId: "listProducts",
        },
    ]);
});

test("Page execution resolves logical cms-query targets without provider HTTP routes", async () => {
    const service = new PageExecutionService({
        siteId: "site-a",
        content: { getRenderablePage: async () => null },
        invoker: {
            resolveHttp: async () => {
                throw new Error("logical queries must not resolve an HTTP route");
            },
        },
        authority: {
            activate: async () => ({}) as never,
            authorize: async () => ({}) as never,
        },
        resolveCapability: async (contractId, capabilityId) =>
            contractId === "catalog.items" && capabilityId === "list"
                ? { access: "authenticated", version: "3.2.1" }
                : null,
    });
    const selected = {
        page: {
            ...page,
            content: '<section cms-query="catalog.items:list as products"></section>',
        },
        requirements: [],
    };

    expect(await service.requiredAccess(selected, new URL("https://example.test/products"), "/.cms/call")).toBe(
        "authenticated",
    );
    expect(await service.resolveRequirements(selected, new URL("https://example.test/products"), "/.cms/call")).toEqual(
        [{ contractId: "catalog.items", capabilityId: "list", versionRange: "=3.2.1" }],
    );
});
