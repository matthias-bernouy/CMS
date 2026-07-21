import { describe, expect, test } from "bun:test";
import type { Source } from "@bernouy/cms-sources";
import { validateDashboard, type Dashboard } from "@bernouy/cms-dashboards";

const source: Source = {
    urn: "urn:offers",
    endpoints: [
        {
            urn: "urn:offers:getOffer",
            method: "GET",
            targetUrl: "https://api.example.com/offers/offer",
            input: { params: [{ name: "id", in: "query", schema: { type: "string" } }] },
        },
        {
            urn: "urn:offers:updateOffer",
            method: "POST",
            targetUrl: "https://api.example.com/offers/offer",
            input: {
                params: [{ name: "id", in: "query", schema: { type: "string" } }],
                body: {
                    type: "object",
                    properties: {
                        title: { type: "string" },
                        metadata: {
                            type: "object",
                            properties: { company: { type: "string" } },
                        },
                    },
                },
            },
        },
    ],
};

describe("dashboard endpoint references", () => {
    test("allows explicit refs to another source", () => {
        const dashboard = baseDashboard();
        const field = dashboard.views[0]!.main[0]!.fields[0]!;
        if (field.type !== "combobox") {
            throw new Error("expected combobox fixture");
        }
        field.lookup = {
            sourceId: "products",
            endpoint: "listProducts",
            params: { q: "$search" },
            itemsPath: "items",
            valuePath: "id",
            labelPath: "title",
        };

        expect(validateDashboard(dashboard, { source })).toEqual([]);
    });

    test("validates dotted action body paths against same-source endpoint bodies", () => {
        const dashboard = baseDashboard();
        const action = dashboard.views[0]!.actions![0]!;
        action.endpoint!.body = {
            title: "$field.title",
            "metadata.company": "$field.company",
        };
        expect(validateDashboard(dashboard, { source })).toEqual([]);

        action.endpoint!.body = { "metadata.missing": "$field.company" };
        expect(validateDashboard(dashboard, { source })).toContain(
            'views.0.actions.0.endpoint.body.metadata.missing is not declared by endpoint "urn:offers:updateOffer"',
        );
    });
});

function baseDashboard(): Dashboard {
    return {
        id: "offers",
        source: "offers",
        views: [
            {
                widget: "w-detail",
                id: "offerDetail",
                source: { endpoint: "getOffer", params: { id: "$selection.id" } },
                actions: [
                    {
                        id: "save",
                        label: "Save",
                        endpoint: {
                            endpoint: "updateOffer",
                            params: { id: "$resource.id" },
                            body: { title: "$field.title" },
                        },
                    },
                ],
                main: [
                    {
                        id: "details",
                        title: "Details",
                        fields: [
                            {
                                id: "productId",
                                label: "Product",
                                path: "productId",
                                type: "combobox",
                                allowCustom: true,
                            },
                            { id: "title", label: "Title", path: "title", type: "text" },
                            { id: "company", label: "Company", path: "metadata.company", type: "text" },
                        ],
                    },
                ],
            },
        ],
    };
}
