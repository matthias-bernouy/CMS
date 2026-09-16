import { expect, test } from "bun:test";

import getCollectionWorkspace, {
    type CollectionWorkspaceResponse,
} from "cms-control/api/_content/collections/workspace.get";
import { collectionDefinition, installCollectionDefinition, libraryHarness } from "./fixtures";

const base = "https://cms.test/tenant/control/api/collections/workspace";

test("theme overview infers a useful generic specimen when an older snapshot has no preview metadata", async () => {
    const harness = await libraryHarness();
    const ulvia = collectionDefinition("ulvia");
    ulvia.theme = {
        categories: [
            {
                id: "interface",
                label: "Interface",
                tokens: [
                    token("page-background", "Page background", "#fafafa", "#111111"),
                    token("surface-background", "Surface background", "#ffffff", "#222222"),
                    token("surface-text", "Surface text", "#222222", "#f5f5f5"),
                    token("body-text", "Body text", "#444444", "#dddddd"),
                    token("primary-base", "Primary", "#16634d", "#66d3ad"),
                ],
            },
        ],
    };
    await installCollectionDefinition(harness, "ulvia", ulvia);
    const gallery = structuredClone(harness.definition);
    gallery.theme = { dependencies: [{ kind: "ulvia", versionRange: "^1.0.0" }], categories: [] };
    await installCollectionDefinition(harness, "gallery", gallery);

    const overviewResponse = await getCollectionWorkspace(
        new Request(`${base}?collection=managed%3Agallery&section=theme`),
        harness.cms,
    );
    const overview = (await overviewResponse.json()) as CollectionWorkspaceResponse;
    expect(overview.themeDetail?.specimen.bindings).toEqual({
        page: "ulvia-page-background",
        surface: "ulvia-surface-background",
        heading: "ulvia-surface-text",
        body: "ulvia-body-text",
        accent: "ulvia-primary-base",
    });

    const tokenResponse = await getCollectionWorkspace(
        new Request(`${base}?collection=managed%3Agallery&section=theme&token=ulvia-body-text`),
        harness.cms,
    );
    const selected = (await tokenResponse.json()) as CollectionWorkspaceResponse;
    expect(selected.themeDetail?.specimen.bindings).toEqual({ body: "ulvia-body-text" });
});

function token(id: string, label: string, light: string, dark: string) {
    return { id, label, type: "color" as const, defaults: { light, dark } };
}
