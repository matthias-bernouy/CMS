import { describe, test, expect } from "bun:test";
import { MtControlClient, MtControlClientError, type TenantCreateInput } from "src/exports/MtControlClient";

type FetchCall = { url: string; method: string; headers: Record<string, string>; body?: unknown };

function makeFakeFetch(response: { ok: boolean; status?: number; data?: unknown; error?: { code: string; message: string } }): { fetch: typeof fetch; calls: FetchCall[] } {
    const calls: FetchCall[] = [];
    const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        const method = init?.method ?? "GET";
        const headers: Record<string, string> = {};
        if (init?.headers) {
            for (const [k, v] of Object.entries(init.headers as Record<string, string>)) headers[k] = v;
        }
        let body: unknown = undefined;
        if (init?.body) {
            const raw = init.body;
            body = typeof raw === "string" ? JSON.parse(raw) : raw;
        }
        calls.push({ url, method, headers, body });
        return new Response(JSON.stringify(response), { status: response.status ?? (response.ok ? 200 : 400) });
    }) as unknown as typeof fetch;
    return { fetch: fakeFetch, calls };
}

const ORIGIN = "https://cms.bernouy.com";

const TENANT: TenantCreateInput = {
    id:   "acme",
    name: "ACME",
    keycloak: {
        issuer:        "https://auth.example/realms/acme",
        clientId:      "cms",
        clientSecret:  "s",
        sessionSecret: "x".repeat(32),
        adminRole:     "admin",
        cliClientId:   "cms-cli",
    },
    assetsCdn: { url: "https://cdn.example", bucketCredential: "bsp_xxx" },
    delivery:  {
        publicCdn: { url: "https://cdn.example", bucketCredential: "bsp_yyy" },
        alias:     "acme.com",
        enabled:   true,
    },
};

describe("MtControlClient — request shape", () => {
    test("attaches Bearer token + JSON content-type on POST", async () => {
        const { fetch, calls } = makeFakeFetch({ ok: true, data: { id: "acme", name: "ACME" } });
        const client = new MtControlClient({ baseUrl: ORIGIN, token: "mtc_xxx", fetch });
        await client.createTenant(TENANT);
        expect(calls).toHaveLength(1);
        expect(calls[0]!.headers["Authorization"]).toBe("Bearer mtc_xxx");
        expect(calls[0]!.headers["Content-Type"]).toBe("application/json");
        expect(calls[0]!.method).toBe("POST");
        expect(calls[0]!.url).toBe(`${ORIGIN}/superadmin/api/tenants`);
    });

    test("createTenant flattens nested keycloak/assetsCdn/delivery into dotted-key wire shape", async () => {
        const { fetch, calls } = makeFakeFetch({ ok: true, data: { id: "acme" } });
        const client = new MtControlClient({ baseUrl: ORIGIN, token: "t", fetch });
        await client.createTenant(TENANT);
        const body = calls[0]!.body as Record<string, unknown>;
        expect(body["keycloak.issuer"]).toBe("https://auth.example/realms/acme");
        expect(body["keycloak.cliClientId"]).toBe("cms-cli");
        expect(body["assetsCdn.url"]).toBe("https://cdn.example");
        expect(body["assetsCdn.bucketCredential"]).toBe("bsp_xxx");
        expect(body["delivery.publicCdn.url"]).toBe("https://cdn.example");
        expect(body["delivery.publicCdn.bucketCredential"]).toBe("bsp_yyy");
        expect(body["delivery.alias"]).toBe("acme.com");
        expect(body["delivery.enabled"]).toBe("true");
    });

    test("createTenant omits delivery block when input.delivery is undefined", async () => {
        const { fetch, calls } = makeFakeFetch({ ok: true, data: { id: "x" } });
        const client = new MtControlClient({ baseUrl: ORIGIN, token: "t", fetch });
        const minimal: TenantCreateInput = { ...TENANT, delivery: undefined };
        await client.createTenant(minimal);
        const body = calls[0]!.body as Record<string, unknown>;
        for (const k of Object.keys(body)) expect(k.startsWith("delivery.")).toBe(false);
    });

    test("URL params are encoded (special chars in tenant id)", async () => {
        const { fetch, calls } = makeFakeFetch({ ok: true, data: { id: "x" } });
        const client = new MtControlClient({ baseUrl: ORIGIN, token: "t", fetch });
        await client.deleteTenant("foo bar");
        expect(calls[0]!.url).toBe(`${ORIGIN}/superadmin/api/tenants?id=foo%20bar`);
        expect(calls[0]!.method).toBe("DELETE");
    });

    test("updateTenantDelivery sends only the fields provided", async () => {
        const { fetch, calls } = makeFakeFetch({ ok: true, data: { id: "x", deliveryEnabled: false } });
        const client = new MtControlClient({ baseUrl: ORIGIN, token: "t", fetch });
        await client.updateTenantDelivery("acme", { enabled: false });
        expect(calls[0]!.body).toEqual({ "delivery.enabled": "false" });
    });
});

describe("MtControlClient — response handling", () => {
    test("unwraps `data` on success", async () => {
        const { fetch } = makeFakeFetch({ ok: true, data: [{ id: "a" }, { id: "b" }] });
        const client = new MtControlClient({ baseUrl: ORIGIN, token: "t", fetch });
        const out = await client.listTenants();
        expect(out).toEqual([{ id: "a" }, { id: "b" }] as unknown as Awaited<ReturnType<typeof client.listTenants>>);
    });

    test("throws MtControlClientError on `ok: false` envelope", async () => {
        const { fetch } = makeFakeFetch({ ok: false, status: 409, error: { code: "conflict", message: "tenant already exists" } });
        const client = new MtControlClient({ baseUrl: ORIGIN, token: "t", fetch });
        try {
            await client.createTenant(TENANT);
            expect.unreachable();
        } catch (err) {
            expect(err).toBeInstanceOf(MtControlClientError);
            expect((err as MtControlClientError).code).toBe("conflict");
            expect((err as MtControlClientError).httpStatus).toBe(409);
            expect((err as Error).message).toBe("tenant already exists");
        }
    });

    test("throws on non-JSON response", async () => {
        const fakeFetch = (async () => new Response("<html>502</html>", { status: 502 })) as unknown as typeof fetch;
        const client = new MtControlClient({ baseUrl: ORIGIN, token: "t", fetch: fakeFetch });
        await expect(client.listTenants()).rejects.toBeInstanceOf(MtControlClientError);
    });
});
