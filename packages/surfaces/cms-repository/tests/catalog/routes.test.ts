import { describe, expect, test } from "bun:test";
import {
    REPOSITORY_CATALOG_EDITOR_DATA_SOURCE,
    repositoryCatalogIntegrationUrl,
    repositoryCatalogVersionUrl,
    repositoryPackageDownloadPath,
} from "@bernouy/cms-repository/catalog";

describe("repository catalog routes", () => {
    test("generates query-only CMS page links and anonymous same-origin download paths", () => {
        expect(repositoryCatalogIntegrationUrl("commerce")).toBe("/integrations?kind=commerce");
        expect(repositoryCatalogVersionUrl("commerce", "1.2.3-beta.1+build.2")).toBe(
            "/integrations?kind=commerce&version=1.2.3-beta.1%2Bbuild.2",
        );
        expect(repositoryPackageDownloadPath("commerce", "1.0.0")).toBe(
            "/.cms/repository/api/integrations/package?kind=commerce&version=1.0.0",
        );
        expect(() => repositoryCatalogIntegrationUrl("../private")).toThrow();
        expect(() => repositoryCatalogVersionUrl("commerce", "latest")).toThrow();
    });

    test("describes the direct catalog route for typed editor bindings", () => {
        const source = REPOSITORY_CATALOG_EDITOR_DATA_SOURCE;

        expect(source.url).toBe("/.cms/repository/api/integrations/catalog");
        expect(source.method).toBe("GET");
        expect(source.params?.map(({ name, in: location }) => `${location}:${name}`)).toEqual([
            "query:q",
            "query:category",
            "query:provider",
            "query:compatibility",
            "query:kind",
            "query:version",
        ]);
        expect(source.fields.map(({ path }) => path)).toEqual(
            expect.arrayContaining([
                "schema",
                "view",
                "q",
                "category",
                "provider",
                "compatibility",
                "categories",
                "providers",
                "compatibilityOutcomes",
                "integrations",
                "featuredVersion",
                "versions",
                "release",
            ]),
        );
        expect(source.fields.find(({ path }) => path === "integrations")?.children?.map(({ path }) => path)).toContain(
            "technicalProviders",
        );
        expect(new Set(source.fields.map(({ path }) => path)).size).toBe(source.fields.length);
    });
});
