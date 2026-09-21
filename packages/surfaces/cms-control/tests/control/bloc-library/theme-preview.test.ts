import { expect, test } from "bun:test";
import getCollectionWorkspace, {
    type CollectionWorkspaceResponse,
} from "cms-control/api/_content/collections/workspace.get";
import { configureSiteTheme, libraryHarness } from "./fixtures";

const base = "https://cms.test/tenant/control/api/collections/workspace";

test("theme overview infers a generic specimen from site-owned tokens", async () => {
    const harness = await libraryHarness();
    await configureSiteTheme(harness);
    const overviewResponse = await getCollectionWorkspace(
        new Request(`${base}?collection=code&section=theme`),
        harness.cms,
    );
    const overview = (await overviewResponse.json()) as CollectionWorkspaceResponse;
    expect(overview.themeDetail?.specimen.bindings).toEqual({
        page: "page-background",
        surface: "surface-background",
        heading: "surface-text",
        body: "body-text",
        accent: "primary-base",
    });

    const tokenResponse = await getCollectionWorkspace(
        new Request(`${base}?collection=code&section=theme&token=body-text`),
        harness.cms,
    );
    const selected = (await tokenResponse.json()) as CollectionWorkspaceResponse;
    expect(selected.themeDetail?.specimen.bindings).toEqual({ body: "body-text" });
});
