import { describe, expect, test } from "bun:test";
import { RepositoryCatalogPageProvider } from "@bernouy/cms-repository/catalog";
import { createProductionRepositoryCatalogProvider } from "../../../src/repositoryCatalog";

describe("public repository catalog production composition", () => {
    test("constructs the Delivery provider only from the global anonymous repository", () => {
        const provider = createProductionRepositoryCatalogProvider({
            repositoryReadMode: "global",
            repositoryUrl: "http://cms-repository:3001/.cms/repository",
            publicRepositoryCatalog: { list: async () => [], get: async () => null } as never,
        });

        expect(provider).toBeInstanceOf(RepositoryCatalogPageProvider);
    });

    test("fails fast when management is configured without a global read URL", () => {
        expect(() =>
            createProductionRepositoryCatalogProvider({
                repositoryReadMode: "embedded",
                repositoryUrl: "http://127.0.0.1:3001/.cms/repository",
                publicRepositoryCatalog: { list: async () => [], get: async () => null } as never,
            }),
        ).toThrow("P9R_INTEGRATION_REPOSITORY_URL");
    });
});
