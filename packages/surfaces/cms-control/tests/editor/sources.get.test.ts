import { describe, expect, test } from "bun:test";
import { InMemoryGatewayRepository, seedProviders } from "@bernouy/cms-gateway";
import { BAN_PROVIDER } from "@bernouy/cms-gateway/presets";
import getEditorSources from "cms-control/api/editor/sources.get";
import type { ControlCms } from "cms-control/ControlCms";
import type { Provider } from "@bernouy/cms-gateway";

const MIXED_PROVIDER: Provider = {
    urn: "urn:mixed",
    endpoints: [
        {
            urn: "urn:mixed:list",
            method: "GET",
            targetUrl: "https://api.example.com/items",
            output: [{ status: "200", body: { type: "object", properties: { items: { type: "array", items: { type: "string" } } } } }],
        },
        {
            urn: "urn:mixed:create",
            method: "POST",
            targetUrl: "https://api.example.com/items",
            output: [{ status: "200", body: { type: "object", properties: { id: { type: "string" } } } }],
        },
    ],
};

describe("GET /api/editor/sources", () => {
    test("lists gateway endpoints as editor data sources", async () => {
        const gateway = new InMemoryGatewayRepository();
        await seedProviders(gateway, [BAN_PROVIDER]);

        const response = await getEditorSources(new Request("http://admin/cms/api/editor/sources"), {
            basePath: "/cms",
            gateway,
        } as unknown as ControlCms);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.map((source: { url: string }) => source.url)).toEqual([
            "/cms/.cms/gateway/ban/search",
            "/cms/.cms/gateway/ban/reverse",
        ]);
        expect(body[0].label).toBe("Recherche d'adresse");
        expect(body[0].provider).toBe("ban");
        expect(body[0].providerLabel).toBe("Base Adresse Nationale");
        expect(body[0].fields.some((field: { path: string }) => field.path === "features")).toBe(true);
    });

    test("returns an empty list when gateway is not configured", async () => {
        const response = await getEditorSources(new Request("http://admin/cms/api/editor/sources"), {
            get gateway(): never {
                throw new Error("gateway repository not configured");
            },
        } as unknown as ControlCms);

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual([]);
    });

    test("exposes all endpoint methods", async () => {
        const gateway = new InMemoryGatewayRepository();
        await seedProviders(gateway, [MIXED_PROVIDER]);

        const response = await getEditorSources(new Request("http://admin/cms/api/editor/sources"), {
            basePath: "/cms",
            gateway,
        } as unknown as ControlCms);
        const body = await response.json();

        expect(body.map((source: { method: string; url: string }) => `${source.method} ${source.url}`)).toEqual([
            "/cms/.cms/gateway/mixed/list",
            "/cms/.cms/gateway/mixed/create",
        ].map((url, index) => `${index === 0 ? "GET" : "POST"} ${url}`));
    });
});
