import { expect, test } from "bun:test";
import getLibrary, { type BlocLibraryResponse } from "cms-control/api/_content/bloc/_catalogue/library.get";
import { libraryHarness } from "./fixtures";

const base = "https://cms.test/tenant/control/api/bloc/library";

async function read(harness: Awaited<ReturnType<typeof libraryHarness>>, query = ""): Promise<BlocLibraryResponse> {
    return (await getLibrary(new Request(base + query), harness.cms)).json();
}

test("library projects private and code collections independently of overview search", async () => {
    const harness = await libraryHarness();
    const result = await read(harness, "?search=header");
    expect(result).toMatchObject({
        isOverview: true,
        isAdd: false,
        isCollection: false,
        hasSiteCollections: true,
        hasCodeCollections: true,
    });
    expect(result.collections.map(({ key }) => key)).toEqual(["site:site", `site:${harness.site.id}`, "code"]);
    expect(result.visibleCollections.map(({ key }) => key)).toEqual(["site:site"]);
    expect(result.collections.find(({ key }) => key === `site:${harness.site.id}`)).toMatchObject({
        blocCount: 0,
        countLabel: "0 compositions",
    });
    expect(result.collections.find(({ key }) => key === "site:site")).toMatchObject({
        blocCount: 2,
        href: "/tenant/control/admin/collections/site%3Asite/overview",
    });
    expect(result.collections.find(({ key }) => key === "code")).toMatchObject({ blocCount: 3 });
});

test("code collection filters retain complete categories and Bloc metadata", async () => {
    const harness = await libraryHarness();
    const result = await read(harness, "?collection=code&search=banner&category=Layout&visibility=hidden");
    expect(result.collection).toMatchObject({ active: true, key: "code", isCode: true });
    expect(result.categories).toEqual([
        { value: "", label: "All categories" },
        { value: "Content", label: "Content" },
        { value: "Layout", label: "Layout" },
    ]);
    expect(result).toMatchObject({ totalCount: 3, filteredCount: 1 });
    expect(result.blocs[0]).toMatchObject({
        tag: "gallery-banner",
        selected: false,
        selectable: false,
    });
    expect(result.stateOptions.map(({ value }) => value)).toEqual(["", "available", "hidden"]);
    const detail = await read(harness, "?collection=code&bloc=gallery-card");
    expect(detail.bloc).toMatchObject({
        tag: "gallery-card",
        href: "/tenant/control/admin/collections/code/blocs?bloc=gallery-card",
        thumbnailUrl: "/tenant/control/api/bloc/thumbnail?id=gallery-card",
    });
});

test("site statuses and collection boundaries are preserved", async () => {
    const harness = await libraryHarness();
    const site = await read(harness, "?collection=site%3Asite&visibility=draft");
    expect(site.blocs.map(({ tag }) => tag)).toEqual(["site-legacy"]);
    expect(site.blocs[0]?.href).toBe("/tenant/control/admin/collections/site%3Asite/blocs?bloc=site-legacy");
    expect(site.stateOptions.map(({ value }) => value)).toEqual(["", "published", "draft", "archived"]);
    await expect(read(harness, "?collection=unknown")).rejects.toMatchObject({ status: 404 });
    await expect(read(harness, "?collection=site%3Asite&bloc=gallery-card")).rejects.toMatchObject({ status: 404 });
});
