import { describe, expect, test } from "bun:test";
import { IntegrationRepositoryUnavailableError } from "@bernouy/cms-integrations";
import { RepositoryCatalogPageProvider } from "@bernouy/cms-repository/catalog";
import { catalogReader, commerceSummary, commerceVersion, document, EMPTY_CONTEXT } from "./fixtures";

describe("repository catalog provider failures", () => {
    test("does not touch the reader for unrelated Delivery paths", async () => {
        let calls = 0;
        const provider = new RepositoryCatalogPageProvider(
            catalogReader({
                listIntegrations: async () => {
                    calls++;
                    return document([]);
                },
            }),
        );

        expect(await provider.resolvePage("/about", EMPTY_CONTEXT)).toBeNull();
        expect(calls).toBe(0);
    });

    test("returns null for absent kinds and versions so Delivery keeps its 404 fallback", async () => {
        const provider = new RepositoryCatalogPageProvider(catalogReader());

        expect(await provider.resolvePage("/integrations/missing", EMPTY_CONTEXT)).toBeNull();
        expect(await provider.resolvePage("/integrations/commerce/versions/9.0.0", EMPTY_CONTEXT)).toBeNull();
    });

    test("renders a bodyful 503 page without a cache identity for typed unavailability", async () => {
        const provider = new RepositoryCatalogPageProvider(
            catalogReader({
                listIntegrations: async () => {
                    throw new IntegrationRepositoryUnavailableError();
                },
            }),
        );
        const result = await provider.resolvePage("/integrations", EMPTY_CONTEXT);

        expect(result?.status).toBe(503);
        expect(result?.cacheIdentity).toBeUndefined();
        expect(result?.page.content).toContain("repository could not be reached");
        expect(result?.page.content).not.toContain("Integration repository is unavailable");
    });

    test("fails closed with a sanitized 502 page for invalid reader data", async () => {
        const invalid = { ...commerceSummary(), label: "x".repeat(2_000) };
        const provider = new RepositoryCatalogPageProvider(
            catalogReader({ listIntegrations: async () => document([invalid], "invalid-reader-revision") }),
        );
        const result = await provider.resolvePage("/integrations", EMPTY_CONTEXT);

        expect(result?.status).toBe(502);
        expect(result?.cacheIdentity).toBeUndefined();
        expect(result?.page.content).not.toContain("x".repeat(100));
        expect(result?.page.content).not.toContain("invalid-reader-revision");
    });

    test("rejects malformed public compatibility provenance", async () => {
        const version = commerceVersion();
        const compatibility = version.compatibility;
        if (!compatibility) {
            throw new Error("Compatibility fixture is required");
        }
        const provider = new RepositoryCatalogPageProvider(
            catalogReader({
                getVersion: async () =>
                    document({
                        integration: commerceSummary(),
                        version: {
                            ...version,
                            compatibility: {
                                ...compatibility,
                                admission: { ...compatibility.admission, packageDigest: "not-a-digest" },
                            },
                        },
                    }),
            }),
        );

        const result = await provider.resolvePage("/integrations/commerce/versions/1.1.0", EMPTY_CONTEXT);

        expect(result?.status).toBe(502);
        expect(result?.page.content).toContain("catalog data that could not be displayed");
        expect(result?.page.content).not.toContain("not-a-digest");
    });
});
