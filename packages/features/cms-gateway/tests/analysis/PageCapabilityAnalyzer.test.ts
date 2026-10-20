import { expect, test } from "bun:test";
import type { TPage } from "@bernouy/cms-content/rendering";
import { PageCapabilityAnalyzer, pageRequiresCapabilityAnalysis } from "@bernouy/cms-gateway/analysis";

const page: TPage = {
    id: "products",
    revision: 4,
    path: "/products",
    title: "Products",
    description: "",
    content: '<form cms-mutation="shop:list-products as products"></form>',
    visible: true,
    tags: [],
};

test("derives Page access from declared and authored capabilities", async () => {
    const analyzer = new PageCapabilityAnalyzer({
        resolveCapability: async (contractId, capabilityId) => {
            if (contractId === "shop" && capabilityId === "list-products") {
                return { access: "authenticated", version: "2.3.0" };
            }
            return contractId === "search" && capabilityId === "read" ? { access: "public", version: "1.4.0" } : null;
        },
    });
    const document = {
        page,
        requirements: [{ contractId: "search", capabilityId: "read", versionRange: "^1.0.0" }],
    };

    expect(pageRequiresCapabilityAnalysis(document)).toBe(true);
    expect(await analyzer.requiredAccess(document)).toBe("authenticated");
    expect(await analyzer.resolveRequirements(document)).toEqual([
        { contractId: "search", capabilityId: "read", versionRange: "^1.0.0" },
        { contractId: "shop", capabilityId: "list-products", versionRange: "=2.3.0" },
    ]);
});

test("rejects unavailable and version-incompatible Page requirements", async () => {
    const analyzer = new PageCapabilityAnalyzer({
        resolveCapability: async (contractId) =>
            contractId === "catalog" ? { access: "public", version: "1.4.0" } : null,
    });

    await expect(
        analyzer.requiredAccess({
            page: { ...page, content: "" },
            requirements: [{ contractId: "catalog", capabilityId: "read", versionRange: "^2.0.0" }],
        }),
    ).resolves.toBeNull();
    await expect(
        analyzer.requiredAccess({
            page: { ...page, content: '<section cms-query="missing:list as items"></section>' },
            requirements: [],
        }),
    ).resolves.toBeNull();
});

test("ignores Kernel-local queries and promotes administrator capabilities", async () => {
    const analyzer = new PageCapabilityAnalyzer({
        resolveCapability: async (contractId, capabilityId) =>
            contractId === "admin" && capabilityId === "settings" ? { access: "admin", version: "1.0.0" } : null,
    });
    const document = {
        page: {
            ...page,
            content:
                '<section cms-query="kernel.runtime:status as runtime"></section><section cms-query="admin:settings as settings"></section>',
        },
        requirements: [],
    };

    expect(await analyzer.requiredAccess(document)).toBe("admin");
});
