import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { loadIntegrationDefinition } from "../../../../../tests/helpers/integrationDefinition";
import { commerceDefinitionWithDeferredDashboards } from "../catalog/support/deferredDashboards";

type RecordValue = Record<string, any>;

const definitionPath = resolve(import.meta.dir, "../../definition.json");

describe("commerce offer media contract", () => {
    test("exposes admin and seller-owned image operations", async () => {
        const definition = await loadIntegrationDefinition<RecordValue>(definitionPath);
        const endpoints = definition.artifacts.find((artifact: RecordValue) => artifact.source).source.endpoints;
        const byId = Object.fromEntries(endpoints.map((endpoint: RecordValue) => [endpoint.endpointId, endpoint]));

        expect(Object.keys(byId)).toEqual(
            expect.arrayContaining([
                "offerImage",
                "uploadOfferImage",
                "replaceOfferImage",
                "removeOfferImage",
                "reorderOfferImages",
                "myOfferImage",
                "myOrderImage",
                "uploadMyOfferImage",
                "replaceMyOfferImage",
                "removeMyOfferImage",
                "reorderMyOfferImages",
            ]),
        );
        expect(byId.offerImage).toMatchObject({ method: "GET", responseKind: "file", mediaType: "image/*" });
        expect(byId.myOfferImage).toMatchObject({ access: "auth", method: "GET", responseKind: "file" });
        expect(byId.myOrderImage).toMatchObject({ access: "auth", method: "GET", responseKind: "file" });
        expect(byId.uploadMyOfferImage).toMatchObject({ access: "auth", method: "POST" });
        expect(byId.reorderOfferImages.body.required).toEqual(["mediaIds"]);

        for (const endpointId of ["offer", "myOffer", "manageOffer"]) {
            const properties = byId[endpointId].output[0].body.properties;
            expect(properties).toHaveProperty("media");
            expect(properties).toHaveProperty("mainImageMediaId");
        }
    });

    test("stages offer images for the shared Save without immediate attachment mutations", async () => {
        const definition = await commerceDefinitionWithDeferredDashboards<RecordValue>();
        const dashboard = definition.artifacts.find((artifact: RecordValue) =>
            artifact.view?.id.endsWith("-offers"),
        ).view;
        const detail = dashboard.views.find((view: RecordValue) => view.id === "offerDetail");
        const section = detail.main.find((candidate: RecordValue) => candidate.id === "offerMedia");
        const field = section.fields.find((candidate: RecordValue) => candidate.id === "media");

        expect(field).toMatchObject({ type: "media", multiple: true, path: "media" });
        expect(field.item).toEqual({
            idPath: "media.id",
            urlPath: "media.url",
            altPath: "media.alt",
            endpoint: "offerImage",
        });
        expect(field).toMatchObject({
            persist: "save",
            name: "mediaIds",
            staging: { sessionField: "uploadSessionId" },
        });
        expect(field.actions).toEqual({ upload: { endpoint: "stageOfferImage" } });
        expect(detail.save.endpoint).toBe("upsertOffer");
        expect(detail.create.label).toBe("Create offer");
    });
});
