import { describe, expect, test } from "bun:test";
import {
    parseRepositoryCatalogRoute,
    repositoryIntegrationPath,
    repositoryPackageDownloadPath,
    repositoryVersionPath,
} from "@bernouy/cms-repository/catalog";

describe("repository catalog routes", () => {
    test("parses only the three canonical route shapes", () => {
        expect(parseRepositoryCatalogRoute("/integrations")).toEqual({ page: "list" });
        expect(parseRepositoryCatalogRoute("/integrations/commerce")).toEqual({
            page: "integration",
            kind: "commerce",
        });
        expect(parseRepositoryCatalogRoute("/integrations/commerce/versions/1.2.3-beta.1+build.2")).toEqual({
            page: "version",
            kind: "commerce",
            version: "1.2.3-beta.1+build.2",
        });
    });

    test("rejects aliases, traversal, malformed identities and prefix collisions", () => {
        for (const path of [
            "/integrations/",
            "/integrations//commerce",
            "/integrations/%63ommerce",
            "/integrations/../private",
            "/integrations/commerce/versions/latest",
            "/integrations/commerce/versions/01.0.0",
            "/integrations/commerce/versions/1.0.0/extra",
            "/integrations-private",
        ]) {
            expect(parseRepositoryCatalogRoute(path)).toBeNull();
        }
    });

    test("generates canonical page and anonymous same-origin download paths", () => {
        expect(repositoryIntegrationPath("commerce")).toBe("/integrations/commerce");
        expect(repositoryVersionPath("commerce", "1.0.0")).toBe("/integrations/commerce/versions/1.0.0");
        expect(repositoryPackageDownloadPath("commerce", "1.0.0")).toBe(
            "/.cms/repository/api/integrations/package?kind=commerce&version=1.0.0",
        );
    });
});
