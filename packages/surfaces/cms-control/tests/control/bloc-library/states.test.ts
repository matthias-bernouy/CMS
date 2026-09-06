import { expect, test } from "bun:test";
import getLibrary from "cms-control/api/_content/bloc/_catalogue/library.get";
import postAvailability from "cms-control/api/_content/bloc/collections/availability.post";
import { jsonRequest } from "../site-blocs/fixtures";
import { libraryHarness } from "./fixtures";

const base = "https://cms.test/nested/control/api/bloc/library";

test("legacy unspecified selection uses definition defaults but explicit empty selection stays empty", async () => {
    const { cms, integrationInstallations } = await libraryHarness();
    const installed = (await integrationInstallations.get("gallery"))!;
    const { activeResources: _selection, ...withoutSelection } = installed;
    await integrationInstallations.replace(withoutSelection);
    const defaults = await (await getLibrary(new Request(`${base}?collection=managed:gallery`), cms)).json();
    expect(defaults.selectedResources).toEqual(["gallery/blocs/card"]);
    expect(defaults.blocs.find((bloc: { tag: string }) => bloc.tag === "gallery-card").selected).toBe(true);
    expect(defaults.blocs.find((bloc: { tag: string }) => bloc.tag === "gallery-banner").selected).toBe(false);
    await integrationInstallations.replace({ ...installed, activeResources: [] });
    const empty = await (await getLibrary(new Request(`${base}?collection=managed:gallery`), cms)).json();
    expect(empty.selectedResources).toEqual([]);
    expect(empty.blocs.every((bloc: { selected: boolean }) => !bloc.selected)).toBe(true);
});

test("availability preserves explicitly submitted resources missing from the displayed bloc catalogue", async () => {
    const { cms, integrationInstallations } = await libraryHarness();
    const before = await (await getLibrary(new Request(`${base}?collection=managed:gallery`), cms)).json();
    expect(before.blocs.some((bloc: { resourceId?: string }) => bloc.resourceId === "gallery/blocs/retained")).toBe(
        false,
    );
    const resources = before.selectedResources.filter((id: string) => id !== "gallery/blocs/card");
    await postAvailability(
        jsonRequest("https://cms.test/api/bloc/collections/availability?id=gallery", "POST", { resources }),
        cms,
    );
    expect((await integrationInstallations.get("gallery"))?.activeResources).toEqual(["gallery/blocs/retained"]);
    expect((await cms.repository.getBlocRecord("gallery-card")).artifact.catalogue).toBe("inactive");
    expect((await cms.repository.getBlocRecord("gallery-retained")).artifact.catalogue).toBe("active");
});

test("pending installations expose read-only controls while failed installations allow availability retry", async () => {
    const { cms, integrationInstallations } = await libraryHarness();
    const installed = (await integrationInstallations.get("gallery"))!;
    for (const status of ["pending", "failed"] as const) {
        await integrationInstallations.replace({ ...installed, status });
        const result = await (await getLibrary(new Request(`${base}?collection=managed:gallery`), cms)).json();
        expect(result.collection).toMatchObject({
            statusLabel: status === "pending" ? "Pending" : "Failed",
            canCheckUpdates: false,
            canManageAvailability: status === "failed",
        });
        expect(result.blocs.every((bloc: { selectable: boolean }) => bloc.selectable === (status === "failed"))).toBe(
            true,
        );
    }
});
