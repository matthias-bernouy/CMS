import { describe, expect, test } from "bun:test";
import { CompositeGatewayRepository, InMemoryGatewayRepository, seedProviders, SYSTEM_GATEWAY_PROVIDERS } from "@bernouy/cms-gateway";
import { BAN_PROVIDER } from "@bernouy/cms-gateway/presets";
import getEditorSources from "cms-control/api/editor/sources.get";
import type { ControlCms } from "cms-control/ControlCms";
import type { Provider } from "@bernouy/cms-gateway";
import type { DataField } from "@bernouy/cms-content/editor";

type EditorSourceTestDto = {
    label: string;
    url: string;
    method: string;
    provider?: string;
    providerLabel?: string;
    params?: Array<{ name: string; in: string; required?: boolean }>;
    body?: {
        contentType: "application/json";
        fields: Array<{ path: string; type: string; required?: boolean }>;
    };
    fields: DataField[];
};

const MIXED_PROVIDER: Provider = {
    urn: "urn:mixed",
    endpoints: [
        {
            urn: "urn:mixed:list",
            method: "GET",
            targetUrl: "https://api.example.com/items",
            input: {
                params: [
                    { name: "id", in: "path", required: true, schema: { type: "string" } },
                    { name: "q", in: "query", schema: { type: "string" } },
                    { name: "X-Trace", in: "header", schema: { type: "string" } },
                ],
            },
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
        const body = await response.json() as EditorSourceTestDto[];

        expect(response.status).toBe(200);
        expect(body.map(source => source.url)).toEqual([
            "/cms/.cms/gateway/ban/search",
            "/cms/.cms/gateway/ban/reverse",
        ]);
        const searchSource = body[0]!;
        expect(searchSource.label).toBe("Recherche d'adresse");
        expect(searchSource.provider).toBe("ban");
        expect(searchSource.providerLabel).toBe("Base Adresse Nationale");
        expect(searchSource.params?.every(param => param.in === "query" || param.in === "path")).toBe(true);
        expect(searchSource.params?.some(param => param.name === "q" && param.required === true)).toBe(true);
        const features = searchSource.fields.filter((field: DataField) => field.path === "features");
        expect(features).toHaveLength(1);
        const featureField = features[0]!;
        expect(featureField.type).toBe("array");
        expect(featureField.children?.some(field => field.path === "geometry")).toBe(true);
        expect(featureField.children?.some(field => field.path === ".")).toBe(false);
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
        const body = await response.json() as EditorSourceTestDto[];

        expect(body.map(source => `${source.method} ${source.url}`)).toEqual([
            "/cms/.cms/gateway/mixed/list",
            "/cms/.cms/gateway/mixed/create",
        ].map((url, index) => `${index === 0 ? "GET" : "POST"} ${url}`));
        expect(body[0]!.params?.map(param => `${param.in}:${param.name}`)).toEqual([
            "path:id",
            "query:q",
        ]);
    });

    test("lists readonly system auth endpoints as editor sources", async () => {
        const gateway = new CompositeGatewayRepository(new InMemoryGatewayRepository(), SYSTEM_GATEWAY_PROVIDERS);

        const response = await getEditorSources(new Request("http://admin/cms/api/editor/sources"), {
            basePath: "/cms",
            gateway,
        } as unknown as ControlCms);
        const body = await response.json() as EditorSourceTestDto[];

        const login = body.find(source => source.url === "/cms/.cms/gateway/system-auth/login");
        expect(login?.provider).toBe("system-auth");
        expect(login?.providerLabel).toBe("Authentication");
        expect(login?.label).toBe("Log in");
        expect(login?.method).toBe("POST");
        expect(login?.body).toEqual({
            contentType: "application/json",
            fields: [
                { path: "email", type: "string", required: true },
                { path: "password", type: "string", required: true },
                { path: "returnTo", type: "string" },
            ],
        });
    });
});
