import { expect, test } from "bun:test";
import getCollectionWorkspace, {
    type CollectionWorkspaceResponse,
} from "cms-control/api/_content/collections/workspace.get";
import {
    collectionWorkspacePath,
    collectionWorkspaceRouteFromPath,
} from "cms-control/core/content/collectionWorkspace/routes";
import { configureSiteTheme, libraryHarness } from "./fixtures";

const base = "https://cms.test/tenant/control/api/collections/workspace";

test("collection workspace routes preserve stable collection keys and French Bloc spelling", () => {
    expect(collectionWorkspacePath("/tenant/control", "site:campaigns", "blocs")).toBe(
        "/tenant/control/admin/collections/site%3Acampaigns/blocs",
    );
    expect(
        collectionWorkspaceRouteFromPath(
            "/tenant/control/admin/collections/site%3Acampaigns/overview",
            "/tenant/control",
        ),
    ).toEqual({ collection: "site:campaigns", section: "overview" });
    expect(collectionWorkspaceRouteFromPath("/tenant/control/admin/collections", "/tenant/control")).toEqual({});
    expect(
        collectionWorkspaceRouteFromPath(
            "/tenant/control/admin/collections/site%3Acampaigns/blocks",
            "/tenant/control",
        ),
    ).toBeNull();
});

test("collection Blocs expose grouped navigation, preview URLs and default attributes", async () => {
    const harness = await libraryHarness();
    const response = await getCollectionWorkspace(new Request(`${base}?collection=code&section=blocs`), harness.cms);
    const result = (await response.json()) as CollectionWorkspaceResponse;
    expect(result.bloc).toMatchObject({
        tag: "code-card",
        current: true,
        href: "/tenant/control/admin/collections/code/blocs?bloc=code-card",
        previewUrl: "/tenant/control/api/bloc/preview?id=code-card",
    });
    expect(result.groups.map(({ label }) => label)).toEqual(["Content", "Layout"]);

    const selectedResponse = await getCollectionWorkspace(
        new Request(`${base}?collection=code&section=blocs&bloc=gallery-card`),
        harness.cms,
    );
    const selected = (await selectedResponse.json()) as CollectionWorkspaceResponse;
    expect(selected.bloc).toMatchObject({
        tag: "gallery-card",
        current: true,
        defaultAttributes: [
            { name: "tone", value: "accent", hasValue: true },
            { name: "compact", value: "", hasValue: false },
        ],
    });
    expect(selected.groups.flatMap(({ blocs }) => blocs).filter(({ current }) => current)).toHaveLength(1);
});

test("collection workspace projects the site theme without provider installation state", async () => {
    const harness = await libraryHarness();
    await configureSiteTheme(harness);
    const response = await getCollectionWorkspace(
        new Request(`${base}?collection=code&section=theme&token=body-text`),
        harness.cms,
    );
    const result = (await response.json()) as CollectionWorkspaceResponse;
    expect(result).toMatchObject({ isCollection: true, isTheme: true, isBlocs: false });
    expect(result.collection).toMatchObject({
        href: "/tenant/control/admin/collections/code/overview",
        blocsHref: "/tenant/control/admin/collections/code/blocs",
        kindLabel: "Code collection",
    });
    expect(result.theme).toMatchObject({
        statusLabel: "Uses site theme",
        providerLabel: "Site",
        categoryCount: 1,
        tokenCount: 5,
    });
    expect(result.themeDetail?.token).toMatchObject({
        variable: "body-text",
        light: "#444444",
        dark: "#dddddd",
    });
    expect(JSON.stringify(result)).not.toContain("installation");
});

test("collection workspace rejects unknown sections", async () => {
    const harness = await libraryHarness();
    await expect(getCollectionWorkspace(new Request(`${base}?section=blocks`), harness.cms)).rejects.toMatchObject({
        status: 404,
    });
});
