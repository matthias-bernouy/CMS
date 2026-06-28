import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import postOfficialProviderImport from "cms-control/api/gateway-provider/official-import.post";
import { InMemorySourceRepository, ValidatingSourceRepository } from "@bernouy/cms-sources";
import { InMemorySecretStore, ValidatingSecretStore } from "@bernouy/cms-secrets";

const makeCms = () => {
    const gateway = new ValidatingSourceRepository(new InMemorySourceRepository());
    const secrets = new ValidatingSecretStore(new InMemorySecretStore());
    return { cms: { sources: gateway, secrets } as any, gateway, secrets };
};

const post = (body: Record<string, unknown>) =>
    new Request("http://localhost/cms/api/gateway-provider/official-import", {
        method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" },
    });

const supabaseSpec = JSON.stringify({
    swagger: "2.0",
    info: { title: "Supabase API", version: "1" },
    schemes: ["https"],
    host: "project.supabase.co",
    basePath: "/rest/v1",
    paths: {
        "/todos": { get: {
            operationId: "listTodos",
            responses: { "200": { schema: { type: "array", items: { type: "object" } } } },
        } },
    },
});

const supabaseRpcSpec = JSON.stringify({
    swagger: "2.0",
    info: { title: "Supabase API", version: "1" },
    schemes: ["https"],
    host: "project.supabase.co",
    basePath: "/rest/v1",
    paths: {
        "/rpc/list_posts": { post: {
            operationId: "listPosts",
            responses: { "200": { description: "ok" } },
        } },
        "/rpc/cms_gateway_rpc_output_shapes": {
            get: {
                operationId: "cmsGatewayRpcOutputShapesGet",
                responses: { "200": { description: "ok" } },
            },
            post: {
                operationId: "cmsGatewayRpcOutputShapesPost",
                responses: { "200": { description: "ok" } },
            },
        },
    },
});

const rpcOutputMetadata = {
    functions: [
        {
            schema: "public",
            name: "list_posts",
            arguments: "",
            result: "SETOF posts",
            returnsSet: true,
            returnType: {
                dataType: "posts",
                typeSchema: "public",
                typeName: "posts",
                typeKind: "c",
                typeCategory: "C",
            },
            fields: [
                { name: "id", dataType: "uuid", typeSchema: "pg_catalog", typeName: "uuid", typeKind: "b", typeCategory: "U" },
                { name: "title", dataType: "text", typeSchema: "pg_catalog", typeName: "text", typeKind: "b", typeCategory: "S" },
                { name: "price", dataType: "numeric", typeSchema: "pg_catalog", typeName: "numeric", typeKind: "b", typeCategory: "N" },
                { name: "published", dataType: "boolean", typeSchema: "pg_catalog", typeName: "bool", typeKind: "b", typeCategory: "B" },
                {
                    name: "tags",
                    dataType: "text[]",
                    typeSchema: "pg_catalog",
                    typeName: "_text",
                    typeKind: "b",
                    typeCategory: "A",
                    element: {
                        dataType: "text",
                        typeSchema: "pg_catalog",
                        typeName: "text",
                        typeKind: "b",
                        typeCategory: "S",
                    },
                },
            ],
        },
    ],
};

afterEach(() => {
    mock.restore();
});

describe("POST /api/gateway-provider/official-import", () => {
    test("imports Supabase, stores the API key as a secret and injects gateway headers", async () => {
        const { cms, gateway, secrets } = makeCms();
        const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response(supabaseSpec, {
            status: 200,
            headers: { "content-type": "application/openapi+json" },
        }));

        const res = await postOfficialProviderImport(post({
            kind: "supabase",
            id: "my-db",
            "meta.name": "Main database",
            projectUrl: "https://project.supabase.co",
            apiKey: "service-role-key",
        }), cms);

        expect(res.ok).toBe(true);
        expect(String(fetchSpy.mock.calls[0]![0])).toBe("https://project.supabase.co/rest/v1/");
        const fetchHeaders = new Headers(fetchSpy.mock.calls[0]![1]!.headers);
        expect(fetchHeaders.get("accept-profile")).toBe("public");
        expect(fetchHeaders.get("apikey")).toBe("service-role-key");
        expect(fetchHeaders.get("authorization")).toBe("Bearer service-role-key");

        expect(await secrets.get("SUPABASE_MY_DB_API_KEY")).toBe("service-role-key");
        const stored = await gateway.getSource("urn:my-db");
        expect(stored?.meta?.name).toBe("Main database");
        expect(stored?.endpoints[0]!.targetUrl).toBe("https://project.supabase.co/rest/v1/todos");
        expect(stored?.endpoints[0]!.headers).toEqual([
            { name: "apikey", source: { from: "secret", ref: "${SUPABASE_MY_DB_API_KEY}" } },
            { name: "authorization", source: { from: "secret", ref: "${SUPABASE_MY_DB_API_KEY}", prefix: "Bearer " } },
        ]);
    });

    test("rejects unsupported official providers before fetching", async () => {
        const { cms } = makeCms();
        const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response(supabaseSpec));
        await expect(postOfficialProviderImport(post({
            kind: "stripe",
            id: "stripe",
            projectUrl: "https://project.supabase.co",
            apiKey: "key",
        }), cms)).rejects.toThrow(/Invalid param kind/);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    test("does not create a secret or provider when Supabase OpenAPI fetch fails", async () => {
        const { cms, gateway, secrets } = makeCms();
        spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 401 }));

        await expect(postOfficialProviderImport(post({
            kind: "supabase",
            id: "my-db",
            projectUrl: "https://project.supabase.co",
            apiKey: "bad-key",
        }), cms)).rejects.toThrow(/Supabase OpenAPI request failed/);

        expect(await secrets.get("SUPABASE_MY_DB_API_KEY")).toBeNull();
        expect(await gateway.getSource("urn:my-db")).toBeNull();
    });

    test("enriches Supabase RPC response outputs from the installed metadata RPC", async () => {
        const { cms, gateway } = makeCms();
        const fetchSpy = spyOn(globalThis, "fetch").mockImplementation((async (input) => {
            const url = String(input);
            if (url.endsWith("/rpc/cms_gateway_rpc_output_shapes")) {
                return new Response(JSON.stringify(rpcOutputMetadata), {
                    status: 200,
                    headers: { "content-type": "application/json" },
                });
            }
            return new Response(supabaseRpcSpec, {
                status: 200,
                headers: { "content-type": "application/openapi+json" },
            });
        }) as typeof fetch);

        const res = await postOfficialProviderImport(post({
            kind: "supabase",
            id: "my-db",
            projectUrl: "https://project.supabase.co",
            schema: "api",
            apiKey: "secret-key",
        }), cms);

        expect(res.ok).toBe(true);
        const openApiHeaders = new Headers(fetchSpy.mock.calls[0]![1]!.headers);
        expect(openApiHeaders.get("accept-profile")).toBe("api");
        expect(String(fetchSpy.mock.calls[1]![0])).toBe("https://project.supabase.co/rest/v1/rpc/cms_gateway_rpc_output_shapes");
        const metadataHeaders = new Headers(fetchSpy.mock.calls[1]![1]!.headers);
        expect(metadataHeaders.get("apikey")).toBe("secret-key");
        expect(metadataHeaders.get("authorization")).toBe("Bearer secret-key");
        expect(metadataHeaders.get("content-profile")).toBe("api");
        expect(fetchSpy.mock.calls[1]![1]!.body).toBe(JSON.stringify({ p_schemas: ["api"] }));

        const endpoints = (await gateway.getSource("urn:my-db"))?.endpoints ?? [];
        expect(endpoints.some(endpoint => endpoint.targetUrl.includes("/rpc/cms_gateway_rpc_output_shapes"))).toBe(false);
        const endpoint = endpoints.find(endpoint => endpoint.targetUrl.includes("/rpc/list_posts"))!;
        expect(endpoint.headers).toEqual([
            { name: "accept-profile", source: { from: "static", value: "api" } },
            { name: "content-profile", source: { from: "static", value: "api" } },
            { name: "apikey", source: { from: "secret", ref: "${SUPABASE_MY_DB_API_KEY}" } },
            { name: "authorization", source: { from: "secret", ref: "${SUPABASE_MY_DB_API_KEY}", prefix: "Bearer " } },
        ]);
        expect(endpoint.output).toEqual([
            {
                status: "200",
                body: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            id: { type: "string" },
                            title: { type: "string" },
                            price: { type: "number" },
                            published: { type: "boolean" },
                            tags: { type: "array", items: { type: "string" } },
                        },
                    },
                },
            },
        ]);
    });

    test("keeps importing Supabase RPC endpoints when the metadata RPC is not installed", async () => {
        const { cms, gateway } = makeCms();
        spyOn(globalThis, "fetch").mockImplementation((async (input) => {
            const url = String(input);
            if (url.endsWith("/rpc/cms_gateway_rpc_output_shapes")) {
                return new Response(JSON.stringify({ message: "not found" }), { status: 404 });
            }
            return new Response(supabaseRpcSpec, {
                status: 200,
                headers: { "content-type": "application/openapi+json" },
            });
        }) as typeof fetch);

        const res = await postOfficialProviderImport(post({
            kind: "supabase",
            id: "my-db",
            projectUrl: "https://project.supabase.co",
            schema: "api",
            apiKey: "secret-key",
        }), cms);

        expect(res.ok).toBe(true);
        expect((await gateway.getSource("urn:my-db"))?.endpoints[0]!.output).toEqual([{ status: "200" }]);
    });
});
