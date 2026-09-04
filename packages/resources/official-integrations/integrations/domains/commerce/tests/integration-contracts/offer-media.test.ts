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
                "uploadMyOfferImage",
                "replaceMyOfferImage",
                "removeMyOfferImage",
                "reorderMyOfferImages",
            ]),
        );
        expect(byId.offerImage).toMatchObject({ method: "GET", responseKind: "file", mediaType: "image/*" });
        expect(byId.myOfferImage).toMatchObject({ access: "auth", method: "GET", responseKind: "file" });
        expect(byId.uploadMyOfferImage).toMatchObject({ access: "auth", method: "POST" });
        expect(byId.reorderOfferImages.body.required).toEqual(["mediaIds"]);

        for (const endpointId of ["offer", "myOffer", "manageOffer"]) {
            const properties = byId[endpointId].output[0].body.properties;
            expect(properties).toHaveProperty("media");
            expect(properties).toHaveProperty("mainImageMediaId");
        }
    });

    test("wires the offer image editor to the admin operations", async () => {
        const definition = await commerceDefinitionWithDeferredDashboards<RecordValue>();
        const dashboard = definition.artifacts.find((artifact: RecordValue) =>
            artifact.dashboard?.id.endsWith("-offers"),
        ).dashboard;
        const detail = dashboard.views.find((view: RecordValue) => view.id === "offerDetail");
        const section = detail.main.find((candidate: RecordValue) => candidate.id === "offerMedia");
        const field = section.fields.find((candidate: RecordValue) => candidate.id === "media");

        expect(field).toMatchObject({ type: "media", multiple: true, path: "media" });
        expect(field.item).toEqual({ idPath: "media.id", urlPath: "media.url", altPath: "media.alt" });
        expect(field.actions.upload.endpoint).toBe("uploadOfferImage");
        expect(field.actions.replace.endpoint).toBe("replaceOfferImage");
        expect(field.actions.remove.endpoint).toBe("removeOfferImage");
        expect(field.actions.reorder.endpoint).toBe("reorderOfferImages");
    });
});
