import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import postOfficialProviderImport from "cms-control/api/gateway-provider/official-import.post";
import { InMemoryGatewayRepository, ValidatingGatewayRepository } from "@bernouy/cms-gateway";
import { InMemorySecretStore, ValidatingSecretStore } from "@bernouy/cms-secrets";

const makeCms = () => {
    const gateway = new ValidatingGatewayRepository(new InMemoryGatewayRepository());
    const secrets = new ValidatingSecretStore(new InMemorySecretStore());
    return { cms: { gateway, secrets } as any, gateway, secrets };
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
        expect(fetchHeaders.get("apikey")).toBe("service-role-key");
        expect(fetchHeaders.get("authorization")).toBe("Bearer service-role-key");

        expect(await secrets.get("SUPABASE_MY_DB_API_KEY")).toBe("service-role-key");
        const stored = await gateway.getProvider("urn:my-db");
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
        expect(await gateway.getProvider("urn:my-db")).toBeNull();
    });
});
