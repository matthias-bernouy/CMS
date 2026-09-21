import { describe, expect, test } from "bun:test";
import { ContentValidationError } from "@bernouy/cms-content";
import getCollections from "cms-control/api/_content/bloc/collections/collections.get";
import postCollection from "cms-control/api/_content/bloc/collections/collections.post";
import getCatalogue from "cms-control/api/_content/bloc/_catalogue/catalogue.get";
import postSiteBloc from "cms-control/api/_content/site-bloc/site-bloc.post";
import { importSiteBlocDefinition } from "cms-control/core/content/siteBloc/cliImport";
import { jsonRequest, seedBloc, siteBlocHarness, siteDefinition } from "../fixtures";

const base = "http://localhost/cms/api";

describe("site collection API", () => {
    test("creates a collection with a server identifier, then lists only its compositions", async () => {
        const { cms, repository } = siteBlocHarness();
        const response = await postCollection(
            jsonRequest(`${base}/bloc/collections`, "POST", { id: "forged", name: "Campaigns" }),
            cms,
        );
        const collection = await response.json();
        expect(response.status).toBe(201);
        expect(collection).toMatchObject({ name: "Campaigns", description: "" });
        expect(collection.id).not.toBe("forged");
        expect(await (await getCollections(new Request(`${base}/bloc/collections`), cms)).json()).toHaveLength(2);
        const created = await postSiteBloc(
            jsonRequest(`${base}/site-bloc`, "POST", {
                tag: "site-campaign",
                name: "Campaign",
                collectionId: collection.id,
            }),
            cms,
        );
        expect((await created.json()).collectionId).toBe(collection.id);
        await repository.createSiteBloc(siteDefinition("site-default"));
        await seedBloc(repository, "code-card");

        const selected = await (
            await getCatalogue(new Request(`${base}/bloc/catalogue?collection=${collection.id}`), cms)
        ).json();
        expect(selected.map((item: { tag: string }) => item.tag)).toEqual(["site-campaign"]);
        const site = await (await getCatalogue(new Request(`${base}/bloc/catalogue?collection=site`), cms)).json();
        expect(site.map((item: { tag: string }) => item.tag)).toEqual(["site-default"]);
        const all = await (await getCatalogue(new Request(`${base}/bloc/catalogue`), cms)).json();
        expect(all.find((item: { tag: string }) => item.tag === "code-card")).toMatchObject({
            collectionId: null,
            origin: { kind: "code-managed" },
        });
    });

    test("defaults new compositions to Site and rejects invalid explicit collections", async () => {
        const { cms, repository } = siteBlocHarness();
        const created = await postSiteBloc(
            jsonRequest(`${base}/site-bloc`, "POST", { tag: "site-default", name: "Default" }),
            cms,
        );
        expect((await created.json()).collectionId).toBe("site");
        for (const collectionId of ["unknown", "", 42]) {
            await expect(
                postSiteBloc(
                    jsonRequest(`${base}/site-bloc`, "POST", { tag: "site-invalid", name: "Invalid", collectionId }),
                    cms,
                ),
            ).rejects.toBeInstanceOf(ContentValidationError);
        }
        expect(await repository.getBlocRecord("site-invalid")).toBeNull();
    });

    test("falls back for foreign CLI collections and preserves local membership on force push", async () => {
        const { cms, repository } = siteBlocHarness();
        const incoming = siteDefinition("site-imported", { collectionId: "foreign-collection" });
        const imported = await importSiteBlocDefinition(cms, JSON.stringify(incoming), incoming.tag, false);
        expect(imported.collectionId).toBe("site");
        const collection = await repository.createSiteBlocCollection({ name: "Local sections", description: "" });
        const local = siteDefinition("site-local", { collectionId: collection.id });
        await repository.createSiteBloc(local);
        const updated = await importSiteBlocDefinition(
            cms,
            JSON.stringify({ ...local, collectionId: "foreign-collection" }),
            local.tag,
            true,
        );
        expect(updated.collectionId).toBe(collection.id);
        const source = await repository.getBlocSource(local.tag);
        expect(JSON.parse(Buffer.from(source!["builder.json"]!, "base64").toString()).collectionId).toBe(collection.id);
    });
});
