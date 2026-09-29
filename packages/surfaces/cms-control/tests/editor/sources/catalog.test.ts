import { expect, test } from "bun:test";
import type { GatewayEditorCapability } from "@bernouy/cms-gateway";
import getEditorCapabilities from "cms-control/api/editor/capabilities.get";
import type { ControlCms } from "cms-control/ControlCms";

const capability: GatewayEditorCapability = {
    contractId: "catalog",
    contractLabel: "Catalog",
    capabilityId: "item.list",
    description: "List items",
    providerId: "ulvia.example",
    providerLabel: "Example Provider",
    input: {
        type: "object",
        properties: { term: { type: "string", maxLength: 50 } },
        required: ["term"],
    },
    output: {
        type: "object",
        properties: { items: { type: "array", items: { type: "string", maxLength: 50 }, maxItems: 10 } },
        required: ["items"],
    },
};

test("editor lists selected gateway capabilities with callable bindings", async () => {
    const response = await getEditorCapabilities(new Request("http://admin/cms/api/editor/capabilities"), {
        basePath: "/cms",
        config: {
            capabilityGateway: {
                siteId: "site-a",
                catalogue: {
                    list: async (siteId: string) => {
                        expect(siteId).toBe("site-a");
                        return [capability];
                    },
                },
            },
        },
    } as unknown as ControlCms);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
        {
            label: "List items",
            url: "/cms/.cms/call/catalog/item.list",
            method: "POST",
            provider: "catalog",
            providerLabel: "Catalog",
            description: "List items",
            body: { contentType: "application/json", fields: [{ path: "term", type: "string", required: true }] },
            fields: [{ path: "items", type: "array", children: [] }],
        },
    ]);
});

test("editor catalogue is empty when gateway is not configured", async () => {
    const response = await getEditorCapabilities(new Request("http://admin/cms/api/editor/capabilities"), {
        config: {},
    } as unknown as ControlCms);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
});
