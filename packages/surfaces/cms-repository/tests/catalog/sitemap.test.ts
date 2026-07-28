import { describe, expect, test } from "bun:test";
import { IntegrationRepositoryUnavailableError } from "@bernouy/cms-integrations";
import { RepositoryCatalogPageProvider } from "@bernouy/cms-repository/catalog";
import { catalogReader } from "./fixtures";

describe("repository catalog sitemap paths", () => {
    test("lists the root, kinds and every immutable version deterministically", async () => {
        const paths = await new RepositoryCatalogPageProvider(catalogReader()).listSitemapPaths();

        expect(paths).toEqual([
            "/integrations",
            "/integrations/commerce",
            "/integrations/commerce/versions/1.0.0",
            "/integrations/commerce/versions/1.1.0",
            "/integrations/newsletter",
            "/integrations/newsletter/versions/1.0.0",
        ]);
    });

    test("keeps the static catalog route without breaking Delivery when the reader is unavailable", async () => {
        const provider = new RepositoryCatalogPageProvider(
            catalogReader({
                listIntegrations: async () => {
                    throw new IntegrationRepositoryUnavailableError();
                },
            }),
        );

        expect(await provider.listSitemapPaths()).toEqual(["/integrations"]);
    });

    test("does not hide unexpected programming errors", async () => {
        const provider = new RepositoryCatalogPageProvider(
            catalogReader({
                listIntegrations: async () => {
                    throw new Error("programming failure");
                },
            }),
        );

        expect(provider.listSitemapPaths()).rejects.toThrow("programming failure");
    });
});
