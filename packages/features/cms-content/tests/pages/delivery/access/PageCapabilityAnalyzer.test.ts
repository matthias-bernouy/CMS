import { satisfiesVersionRange } from "@bernouy/ulvia-contracts/compatibility";
import { expect, test } from "bun:test";
import type { TPage } from "@bernouy/cms-content/rendering";
import { PageCapabilityAnalyzer, pageRequiresCapabilityAnalysis } from "@bernouy/cms-content/public-delivery";

const page: TPage = {
    id: "products",
    revision: 4,
    path: "/products",
    title: "Products",
    description: "",
    content: '<form cms-mutation="ulvia/shop:list-products as products"></form>',
    visible: true,
    tags: [],
};

test("derives Page access from declared and authored capabilities", async () => {
    const analyzer = new PageCapabilityAnalyzer({
        satisfiesVersionRange,
        resolveCapability: async (contractId, capabilityId) => {
            if (contractId === "ulvia/shop" && capabilityId === "list-products") {
                return { access: "authenticated", version: "2.3.0" };
            }
            return contractId === "ulvia/search" && capabilityId === "read"
                ? { access: "public", version: "1.4.0" }
                : null;
        },
    });
    const document = {
        page,
        requirements: [{ contractId: "ulvia/search", capabilityId: "read", versionRange: "^1.0.0" }],
    };

    expect(pageRequiresCapabilityAnalysis(document)).toBe(true);
    expect(await analyzer.requiredAccess(document)).toBe("authenticated");
    expect(await analyzer.resolveRequirements(document)).toEqual([
        { contractId: "ulvia/search", capabilityId: "read", versionRange: "^1.0.0" },
        { contractId: "ulvia/shop", capabilityId: "list-products", versionRange: "=2.3.0" },
    ]);
});

test("rejects unavailable and version-incompatible Page requirements", async () => {
    const analyzer = new PageCapabilityAnalyzer({
        satisfiesVersionRange,
        resolveCapability: async (contractId) =>
            contractId === "ulvia/catalog" ? { access: "public", version: "1.4.0" } : null,
    });

    await expect(
        analyzer.requiredAccess({
            page: { ...page, content: "" },
            requirements: [{ contractId: "ulvia/catalog", capabilityId: "read", versionRange: "^2.0.0" }],
        }),
    ).resolves.toBeNull();
    await expect(
        analyzer.requiredAccess({
            page: { ...page, content: '<section cms-query="ulvia/missing:list as items"></section>' },
            requirements: [],
        }),
    ).resolves.toBeNull();
});

test("promotes administrator capabilities from canonical resource bindings", async () => {
    const analyzer = new PageCapabilityAnalyzer({
        satisfiesVersionRange,
        resolveCapability: async (contractId, capabilityId) =>
            contractId === "ulvia/admin" && capabilityId === "settings" ? { access: "admin", version: "1.0.0" } : null,
    });
    const document = {
        page: {
            ...page,
            content: '<section cms-query="ulvia/admin:settings as settings"></section>',
        },
        requirements: [],
    };

    expect(await analyzer.requiredAccess(document)).toBe("admin");
});

test("resolves one contract snapshot for all Page capabilities", async () => {
    let contractResolutions = 0;
    const analyzer = new PageCapabilityAnalyzer({
        satisfiesVersionRange,
        resolveCapability: async () => {
            throw new Error("individual capability resolution must not be used");
        },
        resolveContract: async (contractId) => {
            contractResolutions += 1;
            return contractId === "ulvia/shop"
                ? {
                      version: "2.3.0",
                      capabilities: [
                          { id: "list-products", access: "public" as const },
                          { id: "read-product", access: "authenticated" as const },
                      ],
                  }
                : null;
        },
    });

    await expect(
        analyzer.requiredAccess({
            page: {
                ...page,
                content:
                    '<section cms-query="ulvia/shop:list-products as products"></section><section cms-query="ulvia/shop:read-product as product"></section>',
            },
            requirements: [],
        }),
    ).resolves.toBe("authenticated");
    expect(contractResolutions).toBe(1);
});
