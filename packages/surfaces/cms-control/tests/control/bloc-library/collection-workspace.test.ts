import { expect, test } from "bun:test";
import getCollectionWorkspace, {
    type CollectionWorkspaceResponse,
} from "cms-control/api/_content/collections/workspace.get";
import {
    collectionWorkspacePath,
    collectionWorkspaceRouteFromPath,
} from "cms-control/core/content/collectionWorkspace/routes";
import { collectionDefinition, installCollectionDefinition, libraryHarness } from "./fixtures";
import { recordingPackageResolver } from "../integrations/support/helpers";

const base = "https://cms.test/tenant/control/api/collections/workspace";

test("collection workspace routes preserve stable collection keys and French bloc spelling", () => {
    expect(collectionWorkspacePath("/tenant/control", "managed:mossa", "blocs")).toBe(
        "/tenant/control/admin/collections/managed%3Amossa/blocs",
    );
    expect(
        collectionWorkspaceRouteFromPath(
            "/tenant/control/admin/collections/managed%3Amossa/overview",
            "/tenant/control",
        ),
    ).toEqual({ collection: "managed:mossa", section: "overview" });
    expect(collectionWorkspaceRouteFromPath("/tenant/control/admin/collections", "/tenant/control")).toEqual({});
    expect(
        collectionWorkspaceRouteFromPath("/tenant/control/admin/collections/managed%3Amossa/blocks", "/tenant/control"),
    ).toBeNull();
    expect(
        collectionWorkspaceRouteFromPath(
            "/tenant/control/admin/collections/managed%3Amossa/defaults",
            "/tenant/control",
        ),
    ).toBeNull();
});

test("landing presents one catalogue with open and import actions", async () => {
    const harness = await libraryHarness();
    const response = await getCollectionWorkspace(new Request(base), harness.cms);
    const result = (await response.json()) as CollectionWorkspaceResponse;

    expect(result.catalogCollections.map(({ kind }) => kind)).toEqual(["additional", "gallery"]);
    expect(result.catalogCollections.find(({ kind }) => kind === "gallery")).toMatchObject({
        imported: true,
        canImport: false,
        href: "/tenant/control/admin/collections/managed%3Agallery/overview",
    });
    expect(result.catalogCollections.find(({ kind }) => kind === "additional")).toMatchObject({
        imported: false,
        canImport: true,
    });
});

test("collection blocs expose grouped navigation, preview URLs and default attributes", async () => {
    const harness = await libraryHarness();
    const response = await getCollectionWorkspace(
        new Request(`${base}?collection=managed%3Agallery&section=blocs`),
        harness.cms,
    );
    const result = (await response.json()) as CollectionWorkspaceResponse;

    expect(result.bloc).toMatchObject({
        tag: "gallery-card",
        current: true,
        href: "/tenant/control/admin/collections/managed%3Agallery/blocs?bloc=gallery-card",
        previewUrl: "/tenant/control/api/bloc/preview?id=gallery-card",
        defaultAttributes: [
            { name: "tone", value: "accent", hasValue: true },
            { name: "compact", value: "", hasValue: false },
        ],
    });
    expect(result.groups.map(({ label }) => label)).toEqual(["Content", "Layout"]);

    const selectedResponse = await getCollectionWorkspace(
        new Request(`${base}?collection=managed%3Agallery&section=blocs&bloc=gallery-banner`),
        harness.cms,
    );
    const selected = (await selectedResponse.json()) as CollectionWorkspaceResponse;
    expect(selected.bloc).toMatchObject({ tag: "gallery-banner", current: true });
    expect(selected.groups.flatMap(({ blocs }) => blocs).filter(({ current }) => current)).toHaveLength(1);
});

test("collection workspace resolves selectable blocs from an exact installed package", async () => {
    const harness = await libraryHarness();
    const installed = (await harness.integrationInstallations.get("gallery"))!;
    const { definitionSnapshot: _snapshot, ...withoutSnapshot } = installed;
    await harness.integrationInstallations.replace({
        ...withoutSnapshot,
        packageDigest: "a".repeat(64),
    });
    harness.cms.integrationPackageResolver = recordingPackageResolver(() => harness.definition).resolver;

    const response = await getCollectionWorkspace(
        new Request(`${base}?collection=managed%3Agallery&section=blocs&bloc=gallery-card`),
        harness.cms,
    );
    const result = (await response.json()) as CollectionWorkspaceResponse;

    expect(result.collection?.canManageAvailability).toBe(true);
    expect(result.bloc).toMatchObject({
        resourceId: "gallery/blocs/card",
        selected: true,
        selectable: true,
    });
});

test("collection workspace resolves an inherited provider theme without exposing installation state", async () => {
    const harness = await libraryHarness();
    const ulvia = collectionDefinition("ulvia");
    ulvia.label = "Ulvia";
    ulvia.theme = {
        preview: { kind: "interface", bindings: { accent: "color-primary" } },
        categories: [
            {
                id: "brand",
                label: "Brand",
                tokens: [
                    {
                        id: "color-primary",
                        label: "Primary color",
                        type: "color",
                        defaults: { light: "#123456", dark: "#abcdef" },
                    },
                    {
                        id: "color-accent",
                        label: "Accent color",
                        type: "color",
                        defaults: { light: "var(--ulvia-color-primary)" },
                    },
                ],
            },
        ],
    };
    await installCollectionDefinition(harness, "ulvia", ulvia);
    const gallery = structuredClone(harness.definition);
    gallery.theme = { dependencies: [{ kind: "ulvia", versionRange: "^1.0.0" }], categories: [] };
    await installCollectionDefinition(harness, "gallery", gallery);
    const system = await harness.repository.getSystem();
    const activeTheme = system.theme.themes.find(({ id }) => id === system.theme.activeThemeId)!;
    await harness.repository.updateSystem({
        theme: {
            ...system.theme,
            themes: [
                {
                    ...activeTheme,
                    values: {
                        ...activeTheme.values,
                        light: { ...activeTheme.values.light, "ulvia-color-primary": "#654321" },
                    },
                },
            ],
        },
    });

    const themeOverviewResponse = await getCollectionWorkspace(
        new Request(`${base}?collection=managed%3Agallery&section=theme`),
        harness.cms,
    );
    const themeOverview = (await themeOverviewResponse.json()) as CollectionWorkspaceResponse;
    expect(themeOverview.themeDetail).toMatchObject({
        overview: true,
        overviewHref: "/tenant/control/admin/collections/managed%3Agallery/theme",
        navigationLabel: "Overview",
        relatedTokens: [],
        specimen: { view: "overview", focus: [] },
    });
    expect(themeOverview.themeDetail?.token).toBeUndefined();
    expect(themeOverview.themeDetail?.specimen.active).toBeUndefined();

    const response = await getCollectionWorkspace(
        new Request(`${base}?collection=managed%3Agallery&section=theme&token=ulvia-color-accent`),
        harness.cms,
    );
    const result = (await response.json()) as CollectionWorkspaceResponse;
    expect(result).toMatchObject({ isCollection: true, isTheme: true, isBlocs: false });
    expect(result.collection).toMatchObject({
        href: "/tenant/control/admin/collections/managed%3Agallery/overview",
        blocsHref: "/tenant/control/admin/collections/managed%3Agallery/blocs",
    });
    expect(result.theme).toMatchObject({
        mode: "inherited",
        statusLabel: "Inherited from Ulvia",
        dependencyRange: "^1.0.0",
        categoryCount: 1,
        tokenCount: 2,
    });
    expect(result.themeDetail?.categories[0]).toMatchObject({ label: "Brand", current: true });
    expect(result.themeDetail?.categories[0]?.tokens[0]).toMatchObject({
        variable: "ulvia-color-primary",
        label: "Primary color",
        current: false,
    });
    expect(result.themeDetail?.token).toMatchObject({
        variable: "ulvia-color-accent",
        light: "var(--ulvia-color-primary)",
        dark: "var(--ulvia-color-primary)",
        lightReferenceLabel: "Primary color",
        lightResolved: "#654321",
        darkResolved: "#abcdef",
        darkUsesLight: true,
    });
    expect(result.themeDetail?.relatedTokens).toEqual([
        {
            variable: "ulvia-color-primary",
            label: "Primary color",
            href: "/tenant/control/admin/collections/managed%3Agallery/theme?token=ulvia-color-primary",
            relationship: "References",
        },
    ]);
    expect(result.themeDetail?.specimen.tokens[0]).toEqual({
        variable: "ulvia-color-primary",
        light: "#654321",
        dark: "#abcdef",
    });
    expect(result.themeDetail?.specimen).toMatchObject({
        kind: "interface",
        view: "focus",
        bindings: { accent: "ulvia-color-primary" },
        active: "ulvia-color-accent",
        activeType: "color",
        focus: ["ulvia-color-accent", "ulvia-color-primary"],
        represented: false,
    });
    expect(JSON.stringify(result)).not.toContain("do-not-project");

    const overviewResponse = await getCollectionWorkspace(
        new Request(`${base}?collection=managed%3Agallery&section=overview`),
        harness.cms,
    );
    const overview = (await overviewResponse.json()) as CollectionWorkspaceResponse;
    expect(overview.theme).toMatchObject({ tokenCount: 2, categoryCount: 1 });
    expect(overview.themeDetail).toBeUndefined();
});

test("collection workspace rejects unknown sections", async () => {
    const harness = await libraryHarness();
    await expect(getCollectionWorkspace(new Request(`${base}?section=blocks`), harness.cms)).rejects.toMatchObject({
        status: 404,
    });
});
