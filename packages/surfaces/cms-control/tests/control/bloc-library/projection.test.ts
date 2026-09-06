import { expect, test } from "bun:test";
import getLibrary, { type BlocLibraryResponse } from "cms-control/api/_content/bloc/_catalogue/library.get";
import { addLegacyInstallation, libraryHarness } from "./fixtures";

const base = "https://cms.test/tenant/control/api/bloc/library";

async function read(harness: Awaited<ReturnType<typeof libraryHarness>>, query = ""): Promise<BlocLibraryResponse> {
    return (await getLibrary(new Request(base + query), harness.cms)).json();
}

test("library projects full navigation independently of overview search, without exposing installation secrets", async () => {
    const harness = await libraryHarness();
    const result = await read(harness, "?search=header");
    expect(result).toMatchObject({
        isOverview: true,
        isAdd: false,
        isCollection: false,
        hasSiteCollections: true,
        hasManagedCollections: true,
        hasCodeCollections: true,
    });
    expect(result.collections.map(({ key }) => key)).toEqual([
        "site:site",
        `site:${harness.site.id}`,
        "managed:gallery",
        "managed:missing",
        "code",
    ]);
    expect(result.visibleCollections.map(({ key }) => key)).toEqual(["site:site"]);
    expect(result.collections.find(({ key }) => key === `site:${harness.site.id}`)).toMatchObject({
        blocCount: 0,
        countLabel: "0 compositions",
    });
    expect(result.collections.find(({ key }) => key === "site:site")).toMatchObject({
        blocCount: 2,
        href: "/tenant/control/admin/blocs?collection=site%3Asite",
    });
    expect(result.collections.find(({ key }) => key === "managed:missing")).toMatchObject({
        blocCount: 1,
        canManageAvailability: false,
        canCheckUpdates: false,
    });
    expect(JSON.stringify(result)).not.toContain("do-not-project");
});

test("collection filters retain complete categories and selection, with exact versioned asset URLs", async () => {
    const harness = await libraryHarness();
    const result = await read(harness, "?collection=managed%3Agallery&search=banner&category=Layout&visibility=hidden");
    expect(result.collection).toMatchObject({
        active: true,
        installationId: "gallery",
        statusLabel: "Active",
        canCheckUpdates: true,
        canManageAvailability: true,
    });
    const icon = new URL(result.collection!.iconUrl!, "https://cms.test");
    expect(icon.pathname).toBe("/tenant/control/api/integrations/asset");
    expect(icon.searchParams.get("version")).toBe("1.2.3");
    const cover = new URL(result.collection!.coverUrl!, "https://cms.test");
    expect(cover.searchParams.get("path")).toBe("assets/cover.webp");
    expect(cover.searchParams.get("version")).toBe("1.2.3");
    expect(result.categories).toEqual([
        { value: "", label: "All categories" },
        { value: "Content", label: "Content" },
        { value: "Layout", label: "Layout" },
    ]);
    expect(result).toMatchObject({
        totalCount: 2,
        filteredCount: 1,
        selectedResources: ["gallery/blocs/card", "gallery/blocs/retained"],
    });
    expect(result.blocs[0]).toMatchObject({
        tag: "gallery-banner",
        resourceId: "gallery/blocs/banner",
        selected: false,
        selectable: true,
        editable: false,
    });
    expect(result.stateOptions.map(({ value }) => value)).toEqual(["", "available", "hidden"]);
    const detail = await read(harness, "?collection=managed%3Agallery&bloc=gallery-card");
    expect(detail.bloc?.tag).toBe("gallery-card");
    const thumbnail = new URL(detail.bloc!.thumbnailUrl!, "https://cms.test");
    expect(thumbnail.pathname).toBe("/tenant/control/api/integrations/asset");
    expect(thumbnail.searchParams.get("version")).toBe("1.2.3");
    expect(thumbnail.searchParams.get("path")).toBe("assets/gallery-card.webp");
});

test("site statuses and legacy managed records stay read-only where appropriate", async () => {
    const harness = await libraryHarness();
    await addLegacyInstallation(harness);
    const site = await read(harness, "?collection=site%3Asite&visibility=draft");
    expect(site.blocs.map(({ tag }) => tag)).toEqual(["site-legacy"]);
    expect(site.blocs[0]?.editPath).toBe("/tenant/control/editor/bloc?id=site-legacy");
    expect(site.stateOptions.map(({ value }) => value)).toEqual(["", "published", "draft", "archived"]);
    const legacy = await read(harness, "?collection=managed%3Alegacy");
    expect(legacy.collection).toMatchObject({ canManageAvailability: false, canCheckUpdates: false });
    expect(legacy.blocs[0]).toMatchObject({ editable: false, selectable: false });
    await expect(read(harness, "?collection=unknown")).rejects.toMatchObject({ status: 404 });
    await expect(read(harness, "?collection=site%3Asite&bloc=gallery-card")).rejects.toMatchObject({ status: 404 });
});

test("add view excludes installed collections and counts selectable resources", async () => {
    const harness = await libraryHarness();
    const result = await read(harness, "?view=add");
    expect(result).toMatchObject({ isOverview: false, isCollection: false, isAdd: true });
    expect(result.available).toHaveLength(1);
    expect(result.available[0]).toMatchObject({
        kind: "additional",
        version: "1.2.3",
        resourceCount: 3,
        canImport: true,
    });
    const installed = (await harness.integrationInstallations.get("gallery"))!;
    await harness.integrationInstallations.replace({ ...installed, activeResources: [] });
    const empty = await read(harness, "?collection=managed%3Agallery");
    expect(empty.selectedResources).toEqual([]);
    expect(empty.blocs.every(({ selected }) => !selected)).toBe(true);
});
