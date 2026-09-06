import { expect, test } from "bun:test";
import { InMemoryCmsRepository } from "@bernouy/cms-content";
import postAvailability from "cms-control/api/_content/bloc/collections/availability.post";
import postComposition from "cms-control/api/_content/site-bloc/site-bloc.post";
import postImport from "cms-control/api/_platform/integrations/import.post";
import { makeCms, postImport as importRequest } from "../integrations/support/helpers";
import { jsonRequest } from "../site-blocs/fixtures";
import { addLegacyInstallation, collectionDefinition, libraryHarness } from "./fixtures";

const url = "https://cms.test/tenant/control/api/bloc/collections/availability?id=gallery";

test("native composition forms can omit tags while explicit tags remain compatible", async () => {
    const { cms, repository, site } = await libraryHarness();
    const create = (name: string, tag?: string) =>
        postComposition(
            jsonRequest("https://cms.test/api/site-bloc", "POST", {
                name,
                collectionId: site.id,
                ...(tag ? { tag } : {}),
            }),
            cms,
        );
    const first = await (await create("Été hero")).json();
    const second = await (await create("Été hero")).json();
    expect(first.tag).toMatch(/^site-ete-hero-[0-9a-f-]{36}$/);
    expect(second.tag).not.toBe(first.tag);
    expect((await repository.getBlocRecord(first.tag))?.siteDefinition?.collectionId).toBe(site.id);
    expect((await (await create("Explicit", "site-explicit")).json()).tag).toBe("site-explicit");
});

test("availability uses whole-selection replacement, including zero selected resources", async () => {
    const definition = collectionDefinition();
    const { cms, integrationInstallations } = makeCms([definition]);
    cms.repository = new InMemoryCmsRepository();
    await postImport(importRequest({ kind: "gallery" }), cms);
    expect((await integrationInstallations.get("gallery"))?.activeResources).toEqual(["gallery/blocs/card"]);
    const response = await postAvailability(jsonRequest(url, "POST", {}), cms);
    expect(response.status).toBe(200);
    expect((await integrationInstallations.get("gallery"))?.activeResources).toEqual([]);
    expect((await cms.repository.getBlocRecord("gallery-card")).artifact.catalogue).toBe("inactive");
    await postAvailability(jsonRequest(url, "POST", { resources: ["gallery/blocs/banner"] }), cms);
    expect((await integrationInstallations.get("gallery"))?.activeResources).toEqual(["gallery/blocs/banner"]);
    expect((await cms.repository.getBlocRecord("gallery-banner")).artifact.catalogue).toBe("active");
});

test("availability rejects legacy owners and malformed or unknown selections before writes", async () => {
    const harness = await libraryHarness();
    await addLegacyInstallation(harness);
    await expect(
        postAvailability(jsonRequest(url.replace("gallery", "legacy"), "POST", {}), harness.cms),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
        postAvailability(jsonRequest(url.replace("gallery", "missing"), "POST", {}), harness.cms),
    ).rejects.toMatchObject({ status: 404 });
    for (const resources of [
        null,
        "gallery/blocs/card",
        [""],
        ["gallery/blocs/card", "gallery/blocs/card"],
        ["unknown"],
    ]) {
        await expect(postAvailability(jsonRequest(url, "POST", { resources }), harness.cms)).rejects.toThrow();
    }
    expect((await harness.integrationInstallations.get("gallery"))?.activeResources).toEqual([
        "gallery/blocs/card",
        "gallery/blocs/retained",
    ]);
});
