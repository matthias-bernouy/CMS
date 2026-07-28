import { describe, expect, test } from "bun:test";
import { createProductionRepositoryCatalogReader, HttpRepositoryCatalogReader } from "../../../src/repositoryCatalog";

describe("public repository catalog production composition", () => {
    test("constructs the shared catalog reader for the public API projection", () => {
        const reader = createProductionRepositoryCatalogReader({
            repositoryUrl: "http://cms-repository:3001/.cms/repository",
            integrationCatalog: { list: async () => [], get: async () => null } as never,
        });

        expect(reader).toBeInstanceOf(HttpRepositoryCatalogReader);
    });
});
