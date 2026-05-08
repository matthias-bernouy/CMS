import { describe, test, expect } from "bun:test";
import { KeycloakAdminClient } from "src/KeycloakAdminClient";
import { KeycloakClientError } from "src/KeycloakClientError";

const KC = "https://auth.bernouy.com";

type Call = { url: string; method: string; headers: Record<string, string>; body?: unknown };
type Reply = { status: number; body?: unknown; headers?: Record<string, string> };

/** Builds a fake fetch that responds with the n-th queued reply, recording every call. */
function makeFetch(replies: Reply[]): { fetch: typeof fetch; calls: Call[] } {
    const calls: Call[] = [];
    let i = 0;
    const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        const method = init?.method ?? "GET";
        const headers: Record<string, string> = {};
        if (init?.headers) for (const [k, v] of Object.entries(init.headers as Record<string, string>)) headers[k] = v;
        let body: unknown = undefined;
        if (init?.body) {
            const raw = init.body as string;
            // form-encoded for token endpoint, JSON elsewhere
            if (typeof raw === "string" && raw.startsWith("grant_type=")) body = Object.fromEntries(new URLSearchParams(raw));
            else                                                          body = JSON.parse(raw);
        }
        calls.push({ url, method, headers, body });
        const r = replies[i++];
        if (!r) throw new Error(`no reply queued for call #${i}`);
        return new Response(r.body !== undefined ? JSON.stringify(r.body) : null, { status: r.status, headers: r.headers });
    }) as unknown as typeof fetch;
    return { fetch: f, calls };
}

const TOKEN_REPLY: Reply = {
    status: 200,
    body:   { access_token: "tok-abc", expires_in: 60 },
};

const AUTH = { type: "client-credentials" as const, realm: "master", clientId: "hub", clientSecret: "secret" };

describe("token acquisition + caching", () => {
    test("first call acquires a token via client_credentials, then attaches it as Bearer", async () => {
        const { fetch, calls } = makeFetch([
            TOKEN_REPLY,
            { status: 201, body: {} },
        ]);
        const kc = new KeycloakAdminClient({ baseUrl: KC, auth: AUTH, fetch });
        await kc.createRealm({ realm: "acme" });
        expect(calls).toHaveLength(2);
        expect(calls[0]!.url).toBe(`${KC}/realms/master/protocol/openid-connect/token`);
        expect(calls[0]!.body).toMatchObject({ grant_type: "client_credentials", client_id: "hub", client_secret: "secret" });
        expect(calls[1]!.url).toBe(`${KC}/admin/realms`);
        expect(calls[1]!.headers["Authorization"]).toBe("Bearer tok-abc");
    });

    test("second call within validity window reuses the cached token", async () => {
        const { fetch, calls } = makeFetch([
            TOKEN_REPLY,
            { status: 201, body: {} },
            { status: 204 },
        ]);
        const kc = new KeycloakAdminClient({ baseUrl: KC, auth: AUTH, fetch });
        await kc.createRealm({ realm: "a" });
        await kc.deleteRealm("a");
        expect(calls).toHaveLength(3);  // 1 token + 2 admin = 3 (no second token)
        expect(calls[2]!.headers["Authorization"]).toBe("Bearer tok-abc");
    });

    test("token endpoint failure surfaces as KeycloakClientError(unauthorized)", async () => {
        const { fetch } = makeFetch([{ status: 401, body: { error: "invalid_client" } }]);
        const kc = new KeycloakAdminClient({ baseUrl: KC, auth: AUTH, fetch });
        try {
            await kc.createRealm({ realm: "x" });
            expect.unreachable();
        } catch (e) {
            expect(e).toBeInstanceOf(KeycloakClientError);
            expect((e as KeycloakClientError).code).toBe("unauthorized");
        }
    });
});

describe("createRealm", () => {
    test("posts realm + enabled, optional displayName, optional smtpServer", async () => {
        const { fetch, calls } = makeFetch([TOKEN_REPLY, { status: 201, body: {} }]);
        const kc = new KeycloakAdminClient({ baseUrl: KC, auth: AUTH, fetch });
        await kc.createRealm({
            realm:       "acme",
            displayName: "ACME",
            smtp: { host: "smtp.x", port: 587, from: "noreply@x", auth: true, user: "u", password: "p", starttls: true },
        });
        expect(calls[1]!.method).toBe("POST");
        expect(calls[1]!.url).toBe(`${KC}/admin/realms`);
        const body = calls[1]!.body as Record<string, unknown>;
        expect(body.realm).toBe("acme");
        expect(body.enabled).toBe(true);
        expect(body.displayName).toBe("ACME");
        // SMTP fields are stringified per Keycloak's quirky API.
        expect(body.smtpServer).toMatchObject({ host: "smtp.x", port: "587", auth: "true", starttls: "true" });
    });

    test("conflict (409) → KeycloakClientError({ code: 'conflict' })", async () => {
        const { fetch } = makeFetch([
            TOKEN_REPLY,
            { status: 409, body: { errorMessage: "Realm with same name exists" } },
        ]);
        const kc = new KeycloakAdminClient({ baseUrl: KC, auth: AUTH, fetch });
        try {
            await kc.createRealm({ realm: "acme" });
            expect.unreachable();
        } catch (e) {
            expect(e).toBeInstanceOf(KeycloakClientError);
            expect((e as KeycloakClientError).code).toBe("conflict");
            expect((e as KeycloakClientError).httpStatus).toBe(409);
            expect((e as Error).message).toMatch(/Realm with same name/);
        }
    });
});

describe("deleteRealm", () => {
    test("DELETEs /admin/realms/{realm}", async () => {
        const { fetch, calls } = makeFetch([TOKEN_REPLY, { status: 204 }]);
        const kc = new KeycloakAdminClient({ baseUrl: KC, auth: AUTH, fetch });
        await kc.deleteRealm("acme");
        expect(calls[1]!.method).toBe("DELETE");
        expect(calls[1]!.url).toBe(`${KC}/admin/realms/acme`);
    });
});

describe("createConfidentialClient", () => {
    test("creates client, extracts UUID from Location, fetches secret", async () => {
        const { fetch, calls } = makeFetch([
            TOKEN_REPLY,
            { status: 201, headers: { Location: `${KC}/admin/realms/acme/clients/aaaa-bbbb-cccc` } },
            { status: 200, body: { value: "client-secret-xxx" } },
        ]);
        const kc = new KeycloakAdminClient({ baseUrl: KC, auth: AUTH, fetch });
        const result = await kc.createConfidentialClient("acme", {
            clientId:               "cms",
            redirectUris:           ["https://cms.example/callback"],
            postLogoutRedirectUris: ["https://cms.example/post-logout"],
            webOrigins:             ["https://cms.example"],
        });
        expect(result.clientUuid).toBe("aaaa-bbbb-cccc");
        expect(result.clientSecret).toBe("client-secret-xxx");
        const createBody = calls[1]!.body as Record<string, unknown>;
        expect(createBody.publicClient).toBe(false);
        expect(createBody.standardFlowEnabled).toBe(true);
        expect(createBody.redirectUris).toEqual(["https://cms.example/callback"]);
        // postLogoutRedirectUris are encoded in attributes.* (Keycloak quirk: ##-separated string)
        expect(createBody.attributes).toEqual({ "post.logout.redirect.uris": "https://cms.example/post-logout" });
        expect(calls[2]!.url).toBe(`${KC}/admin/realms/acme/clients/aaaa-bbbb-cccc/client-secret`);
    });

    test("missing Location header → KeycloakClientError(unknown)", async () => {
        const { fetch } = makeFetch([TOKEN_REPLY, { status: 201 }]);
        const kc = new KeycloakAdminClient({ baseUrl: KC, auth: AUTH, fetch });
        await expect(kc.createConfidentialClient("acme", { clientId: "x", redirectUris: [] })).rejects.toBeInstanceOf(KeycloakClientError);
    });
});

describe("createPublicClient", () => {
    test("posts publicClient: true with device-flow attribute", async () => {
        const { fetch, calls } = makeFetch([
            TOKEN_REPLY,
            { status: 201, headers: { Location: `${KC}/admin/realms/acme/clients/uuid-1` } },
        ]);
        const kc = new KeycloakAdminClient({ baseUrl: KC, auth: AUTH, fetch });
        const result = await kc.createPublicClient("acme", { clientId: "cms-cli" });
        expect(result.clientUuid).toBe("uuid-1");
        const body = calls[1]!.body as Record<string, unknown>;
        expect(body.publicClient).toBe(true);
        expect(body.standardFlowEnabled).toBe(false);
        expect((body.attributes as Record<string, string>)["oauth2.device.authorization.grant.enabled"]).toBe("true");
    });
});

describe("createRealmRole", () => {
    test("POSTs name + optional description", async () => {
        const { fetch, calls } = makeFetch([TOKEN_REPLY, { status: 201, body: {} }]);
        const kc = new KeycloakAdminClient({ baseUrl: KC, auth: AUTH, fetch });
        await kc.createRealmRole("acme", { name: "admin", description: "Tenant admin" });
        expect(calls[1]!.url).toBe(`${KC}/admin/realms/acme/roles`);
        expect(calls[1]!.body).toEqual({ name: "admin", description: "Tenant admin" });
    });
});

describe("createUser + assignRealmRoleToUser + sendActionsEmail", () => {
    test("createUser returns the userId from the Location header", async () => {
        const { fetch, calls } = makeFetch([
            TOKEN_REPLY,
            { status: 201, headers: { Location: `${KC}/admin/realms/acme/users/user-uuid-42` } },
        ]);
        const kc = new KeycloakAdminClient({ baseUrl: KC, auth: AUTH, fetch });
        const userId = await kc.createUser("acme", { username: "matt", email: "matt@x.com", enabled: true });
        expect(userId).toBe("user-uuid-42");
        const body = calls[1]!.body as Record<string, unknown>;
        expect(body.username).toBe("matt");
        expect(body.email).toBe("matt@x.com");
        expect(body.enabled).toBe(true);
    });

    test("assignRealmRoleToUser fetches the role first, then POSTs the binding", async () => {
        const { fetch, calls } = makeFetch([
            TOKEN_REPLY,
            { status: 200, body: { id: "role-uuid", name: "admin", composite: false } },
            { status: 204 },
        ]);
        const kc = new KeycloakAdminClient({ baseUrl: KC, auth: AUTH, fetch });
        await kc.assignRealmRoleToUser("acme", "user-uuid-42", "admin");
        expect(calls[1]!.url).toBe(`${KC}/admin/realms/acme/roles/admin`);
        expect(calls[1]!.method).toBe("GET");
        expect(calls[2]!.url).toBe(`${KC}/admin/realms/acme/users/user-uuid-42/role-mappings/realm`);
        expect(calls[2]!.method).toBe("POST");
        expect(calls[2]!.body).toEqual([{ id: "role-uuid", name: "admin" }]);
    });

    test("sendActionsEmail PUTs the actions array, encodes optional query params", async () => {
        const { fetch, calls } = makeFetch([TOKEN_REPLY, { status: 204 }]);
        const kc = new KeycloakAdminClient({ baseUrl: KC, auth: AUTH, fetch });
        await kc.sendActionsEmail("acme", "user-42", ["UPDATE_PASSWORD", "VERIFY_EMAIL"], { lifespan: 86400, redirectUri: "https://cms.example/welcome", clientId: "cms" });
        expect(calls[1]!.method).toBe("PUT");
        expect(calls[1]!.url).toBe(`${KC}/admin/realms/acme/users/user-42/execute-actions-email?lifespan=86400&redirect_uri=https%3A%2F%2Fcms.example%2Fwelcome&client_id=cms`);
        expect(calls[1]!.body).toEqual(["UPDATE_PASSWORD", "VERIFY_EMAIL"]);
    });
});

describe("error mapping", () => {
    test.each([
        [401, "unauthorized"],
        [403, "forbidden"],
        [404, "not_found"],
        [409, "conflict"],
        [400, "validation_error"],
        [422, "validation_error"],
        [500, "unknown"],
        [502, "unknown"],
    ] as const)("HTTP %i → code '%s'", async (status, code) => {
        const { fetch } = makeFetch([TOKEN_REPLY, { status, body: { errorMessage: `oops ${status}` } }]);
        const kc = new KeycloakAdminClient({ baseUrl: KC, auth: AUTH, fetch });
        try {
            await kc.createRealm({ realm: "x" });
            expect.unreachable();
        } catch (e) {
            expect(e).toBeInstanceOf(KeycloakClientError);
            expect((e as KeycloakClientError).code).toBe(code);
            expect((e as KeycloakClientError).httpStatus).toBe(status);
        }
    });
});
