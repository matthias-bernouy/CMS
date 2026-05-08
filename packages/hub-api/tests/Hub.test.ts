import { describe, test, expect } from "bun:test";
import { Hub } from "src/exports/Hub";
import { HubError } from "src/core/HubError";

const KC  = "https://auth.example";
const CMS = "https://cms.example";
const CDN = "https://cdn-origin.example";
const PUBLIC_CDN = "https://cdn.example";

const SMTP = {
    host: "smtp.example", port: 587, from: "noreply@example",
    auth: true, user: "u", password: "p", starttls: true,
};

type Call = { url: string; method: string; body?: unknown };

/**
 * Builds a fetch that walks an ordered queue of `(matcher, reply)` pairs. Lets the
 * test list the entire HTTP sequence the hub is expected to perform — order matters,
 * any deviation throws "no matching reply" so we catch step ordering regressions.
 */
function makeQueueFetch(queue: Array<{ match: (c: Call) => boolean; reply: { status: number; body?: unknown; headers?: Record<string, string> } }>): { fetch: typeof fetch; calls: Call[] } {
    const calls: Call[] = [];
    let i = 0;
    const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        const method = init?.method ?? "GET";
        let body: unknown = undefined;
        if (init?.body) {
            const raw = init.body as string;
            if (typeof raw === "string" && raw.startsWith("grant_type=")) body = Object.fromEntries(new URLSearchParams(raw));
            else                                                          body = JSON.parse(raw);
        }
        const call: Call = { url, method, body };
        calls.push(call);
        const next = queue[i++];
        if (!next) throw new Error(`unexpected call #${i}: ${method} ${url}`);
        if (!next.match(call)) throw new Error(`call #${i} did not match expected matcher: got ${method} ${url}`);
        return new Response(next.reply.body !== undefined ? JSON.stringify(next.reply.body) : null, { status: next.reply.status, headers: next.reply.headers });
    }) as unknown as typeof fetch;
    return { fetch: f, calls };
}

const TOKEN_REPLY = { match: (c: Call) => c.url.endsWith("/token"), reply: { status: 200, body: { access_token: "jwt-1", expires_in: 60 } } };

const HUB_CONFIG = {
    keycloak: { baseUrl: KC, adminRealm: "master", adminClientId: "hub", adminClientSecret: "x" },
    cms:      { baseUrl: CMS },
    cdn:      { baseUrl: CDN, publicHost: PUBLIC_CDN },
    smtp:     SMTP,
};

describe("Hub.init", () => {
    test("verifies token endpoint + cms tenants endpoint + cdn buckets endpoint", async () => {
        const { fetch, calls } = makeQueueFetch([
            TOKEN_REPLY,
            { match: (c) => c.url === `${CMS}/superadmin/api/tenants`,           reply: { status: 200, body: { ok: true, data: [] } } },
            { match: (c) => c.url === `${CDN}/admin/api/buckets/list`,            reply: { status: 200, body: { ok: true, data: [] } } },
        ]);
        const hub = new Hub({ ...HUB_CONFIG, fetch });
        await hub.init();
        expect(calls).toHaveLength(3);
    });

    test("surfaces keycloak_unreachable on token failure", async () => {
        const { fetch } = makeQueueFetch([
            { match: () => true, reply: { status: 401, body: { error: "invalid_client" } } },
        ]);
        const hub = new Hub({ ...HUB_CONFIG, fetch });
        try { await hub.init(); expect.unreachable(); }
        catch (e) {
            expect(e).toBeInstanceOf(HubError);
            expect((e as HubError).code).toBe("keycloak_unreachable");
        }
    });

    test("surfaces cms_unreachable when cms returns 401/403 (role missing on service account)", async () => {
        const { fetch } = makeQueueFetch([
            TOKEN_REPLY,
            { match: () => true, reply: { status: 403, body: { ok: false, error: { code: "forbidden", message: "role required" } } } },
        ]);
        const hub = new Hub({ ...HUB_CONFIG, fetch });
        try { await hub.init(); expect.unreachable(); }
        catch (e) {
            expect((e as HubError).code).toBe("cms_unreachable");
            expect((e as HubError).message).toMatch(/cms-superadmin/);
        }
    });

    test("surfaces cdn_unreachable when cdn returns 401/403", async () => {
        const { fetch } = makeQueueFetch([
            TOKEN_REPLY,
            { match: () => true, reply: { status: 200, body: { ok: true, data: [] } } },
            { match: () => true, reply: { status: 401, body: { ok: false, error: { code: "unauthorized", message: "no auth" } } } },
        ]);
        const hub = new Hub({ ...HUB_CONFIG, fetch });
        try { await hub.init(); expect.unreachable(); }
        catch (e) {
            expect((e as HubError).code).toBe("cdn_unreachable");
        }
    });
});

describe("Hub.provisionTenant — happy path", () => {
    /** The full provisioning sequence — every HTTP call the recipe is expected to make, in order. */
    function provisionQueue(input: { slug: string; deliveryEnabled?: boolean }) {
        const slug = input.slug;
        const wantsDelivery = input.deliveryEnabled === true;
        const out: Array<{ match: (c: Call) => boolean; reply: { status: number; body?: unknown; headers?: Record<string, string> } }> = [
            TOKEN_REPLY,
            // 1. createRealm
            { match: (c) => c.url === `${KC}/admin/realms` && c.method === "POST", reply: { status: 201, body: {} } },
            // 2. createConfidentialClient (POST + GET secret)
            { match: (c) => c.url === `${KC}/admin/realms/${slug}/clients` && c.method === "POST", reply: { status: 201, headers: { Location: `${KC}/admin/realms/${slug}/clients/cms-uuid` } } },
            { match: (c) => c.url === `${KC}/admin/realms/${slug}/clients/cms-uuid/client-secret`, reply: { status: 200, body: { value: "kc-secret-xxx" } } },
            // 3. createPublicClient
            { match: (c) => c.url === `${KC}/admin/realms/${slug}/clients` && c.method === "POST", reply: { status: 201, headers: { Location: `${KC}/admin/realms/${slug}/clients/cli-uuid` } } },
            // 4. createRealmRole
            { match: (c) => c.url === `${KC}/admin/realms/${slug}/roles` && c.method === "POST", reply: { status: 201, body: {} } },
            // 5. createUser
            { match: (c) => c.url === `${KC}/admin/realms/${slug}/users` && c.method === "POST", reply: { status: 201, headers: { Location: `${KC}/admin/realms/${slug}/users/user-uuid` } } },
            // 6. assignRealmRoleToUser (GET role + POST mapping)
            { match: (c) => c.url === `${KC}/admin/realms/${slug}/roles/admin`, reply: { status: 200, body: { id: "role-uuid", name: "admin" } } },
            { match: (c) => c.url === `${KC}/admin/realms/${slug}/users/user-uuid/role-mappings/realm` && c.method === "POST", reply: { status: 204 } },
            // 7. sendActionsEmail
            { match: (c) => c.url.startsWith(`${KC}/admin/realms/${slug}/users/user-uuid/execute-actions-email`) && c.method === "PUT", reply: { status: 204 } },
            // 8. cdn createBucket assets
            { match: (c) => c.url === `${CDN}/admin/api/buckets` && c.method === "POST", reply: { status: 200, body: { ok: true, data: { id: `${slug}-assets` } } } },
            // 9. cdn createBucketCredential assets
            { match: (c) => c.url === `${CDN}/admin/api/credentials?bucketId=${slug}-assets` && c.method === "POST", reply: { status: 200, body: { ok: true, data: { credential: { id: "cred-1" }, cleartextToken: "bsp_assets" } } } },
        ];
        if (wantsDelivery) {
            out.push(
                // 10. delivery bucket
                { match: (c) => c.url === `${CDN}/admin/api/buckets` && c.method === "POST", reply: { status: 200, body: { ok: true, data: { id: `${slug}-delivery` } } } },
                // 11. delivery credential
                { match: (c) => c.url === `${CDN}/admin/api/credentials?bucketId=${slug}-delivery` && c.method === "POST", reply: { status: 200, body: { ok: true, data: { credential: { id: "cred-2" }, cleartextToken: "bsp_delivery" } } } },
            );
        }
        out.push(
            // 12. cms createTenant
            { match: (c) => c.url === `${CMS}/superadmin/api/tenants` && c.method === "POST", reply: { status: 201, body: { ok: true, data: { id: slug, name: "ACME" } } } },
        );
        return out;
    }

    test("walks the 12 steps in order and returns a populated result", async () => {
        const { fetch, calls } = makeQueueFetch(provisionQueue({ slug: "acme" }));
        const hub = new Hub({ ...HUB_CONFIG, fetch });
        const result = await hub.provisionTenant({
            slug: "acme",
            name: "ACME",
            adminUser: { username: "matt", email: "matt@acme.com", firstName: "Matt", lastName: "Doe" },
        });

        expect(result.slug).toBe("acme");
        expect(result.realm).toBe("acme");
        expect(result.assetsBucketId).toBe("acme-assets");
        expect(result.deliveryBucketId).toBeUndefined();
        expect(result.welcomeEmailSentTo).toBe("matt@acme.com");
        expect(result.keycloakClientId).toBe("cms");
        expect(result.keycloakRoleName).toBe("admin");

        // Check the createTenant body had all the wired-in pieces
        const createTenantCall = calls.find(c => c.url === `${CMS}/superadmin/api/tenants` && c.method === "POST")!;
        const body = createTenantCall.body as Record<string, unknown>;
        expect(body["id"]).toBe("acme");
        expect(body["name"]).toBe("ACME");
        expect(body["keycloak.issuer"]).toBe(`${KC}/realms/acme`);
        expect(body["keycloak.clientId"]).toBe("cms");
        expect(body["keycloak.clientSecret"]).toBe("kc-secret-xxx");          // ← from step 2
        expect(body["keycloak.adminRole"]).toBe("admin");
        expect(body["keycloak.cliClientId"]).toBe("cms-cli");
        expect(body["keycloak.sessionSecret"]).toMatch(/^[a-f0-9]{64}$/);     // ← randomly generated, 32 bytes hex
        expect(body["assetsCdn.url"]).toBe(`${PUBLIC_CDN}/acme-assets`);
        expect(body["assetsCdn.bucketCredential"]).toBe("bsp_assets");        // ← from step 9
    });

    test("creates a delivery bucket + credential when deliveryEnabled is true", async () => {
        const { fetch, calls } = makeQueueFetch(provisionQueue({ slug: "acme", deliveryEnabled: true }));
        const hub = new Hub({ ...HUB_CONFIG, fetch });
        const result = await hub.provisionTenant({
            slug: "acme",
            name: "ACME",
            adminUser: { username: "matt", email: "matt@acme.com" },
            deliveryEnabled: true,
        });
        expect(result.deliveryBucketId).toBe("acme-delivery");

        const createTenantCall = calls.find(c => c.url === `${CMS}/superadmin/api/tenants` && c.method === "POST")!;
        const body = createTenantCall.body as Record<string, unknown>;
        expect(body["delivery.publicCdn.url"]).toBe(`${PUBLIC_CDN}/acme-delivery`);
        expect(body["delivery.publicCdn.bucketCredential"]).toBe("bsp_delivery");
        expect(body["delivery.enabled"]).toBe("true");
    });

    test("encodes the welcome magic-link with UPDATE_PASSWORD and VERIFY_EMAIL actions", async () => {
        const { fetch, calls } = makeQueueFetch(provisionQueue({ slug: "acme" }));
        const hub = new Hub({ ...HUB_CONFIG, fetch });
        await hub.provisionTenant({ slug: "acme", name: "ACME", adminUser: { username: "matt", email: "matt@acme.com" } });
        const emailCall = calls.find(c => c.url.includes("execute-actions-email"))!;
        expect(emailCall.body).toEqual(["UPDATE_PASSWORD", "VERIFY_EMAIL"]);
    });
});

describe("Hub.provisionTenant — rollback on failure", () => {
    test("on createUser failure: best-effort deprovision is invoked, original error rethrown", async () => {
        const slug = "doomed";
        const { fetch, calls } = makeQueueFetch([
            TOKEN_REPLY,
            { match: () => true, reply: { status: 201, body: {} } },                                                              // createRealm OK
            { match: () => true, reply: { status: 201, headers: { Location: `${KC}/admin/realms/${slug}/clients/c1` } } },        // confidential client
            { match: () => true, reply: { status: 200, body: { value: "s" } } },                                                  // client-secret
            { match: () => true, reply: { status: 201, headers: { Location: `${KC}/admin/realms/${slug}/clients/c2` } } },        // public client
            { match: () => true, reply: { status: 201, body: {} } },                                                              // createRealmRole
            // ← createUser fails here:
            { match: () => true, reply: { status: 500, body: { errorMessage: "kc broke" } } },
            // Rollback sequence (deprovisionTenant): cms deleteTenant + 2 bucket deletes + deleteRealm. Each may 404, fine.
            { match: (c) => c.url === `${CMS}/superadmin/api/tenants?id=${slug}` && c.method === "DELETE", reply: { status: 404, body: { ok: false, error: { code: "not_found", message: "x" } } } },
            { match: (c) => c.url === `${CDN}/admin/api/buckets?bucketId=${slug}-assets`   && c.method === "DELETE", reply: { status: 404, body: { ok: false, error: { code: "not_found", message: "x" } } } },
            { match: (c) => c.url === `${CDN}/admin/api/buckets?bucketId=${slug}-delivery` && c.method === "DELETE", reply: { status: 404, body: { ok: false, error: { code: "not_found", message: "x" } } } },
            { match: (c) => c.url === `${KC}/admin/realms/${slug}` && c.method === "DELETE", reply: { status: 204 } },
        ]);

        const hub = new Hub({ ...HUB_CONFIG, fetch });
        try {
            await hub.provisionTenant({ slug, name: "Doomed", adminUser: { username: "u", email: "u@x.com" } });
            expect.unreachable();
        } catch (e) {
            expect(e).toBeInstanceOf(HubError);
            expect((e as HubError).code).toBe("provision_failed");
        }
        // Last call must be the realm DELETE — proves the rollback ran to the end.
        expect(calls[calls.length - 1]!.method).toBe("DELETE");
        expect(calls[calls.length - 1]!.url).toBe(`${KC}/admin/realms/${slug}`);
    });
});

describe("Hub.deprovisionTenant", () => {
    test("happy path: deletes cms tenant + assets bucket + delivery bucket + realm in order", async () => {
        const slug = "acme";
        const { fetch, calls } = makeQueueFetch([
            TOKEN_REPLY,
            { match: (c) => c.url === `${CMS}/superadmin/api/tenants?id=${slug}` && c.method === "DELETE", reply: { status: 200, body: { ok: true, data: { id: slug } } } },
            { match: (c) => c.url === `${CDN}/admin/api/buckets?bucketId=${slug}-assets`   && c.method === "DELETE", reply: { status: 200, body: { ok: true, data: { id: `${slug}-assets` } } } },
            { match: (c) => c.url === `${CDN}/admin/api/buckets?bucketId=${slug}-delivery` && c.method === "DELETE", reply: { status: 200, body: { ok: true, data: { id: `${slug}-delivery` } } } },
            { match: (c) => c.url === `${KC}/admin/realms/${slug}` && c.method === "DELETE", reply: { status: 204 } },
        ]);
        const hub = new Hub({ ...HUB_CONFIG, fetch });
        await hub.deprovisionTenant(slug);
        expect(calls).toHaveLength(5);
    });

    test("tolerates `not_found` from any step (idempotent in spirit)", async () => {
        const slug = "ghost";
        const { fetch } = makeQueueFetch([
            TOKEN_REPLY,
            { match: () => true, reply: { status: 404, body: { ok: false, error: { code: "not_found", message: "no" } } } },  // cms
            { match: () => true, reply: { status: 404, body: { ok: false, error: { code: "not_found", message: "no" } } } },  // assets bucket
            { match: () => true, reply: { status: 404, body: { ok: false, error: { code: "not_found", message: "no" } } } },  // delivery bucket
            { match: () => true, reply: { status: 404, body: { errorMessage: "no realm" } } },                                 // kc
        ]);
        const hub = new Hub({ ...HUB_CONFIG, fetch });
        await expect(hub.deprovisionTenant(slug)).resolves.toBeUndefined();
    });

    test("non-404 error from any step throws deprovision_partial with all error messages", async () => {
        const slug = "broken";
        const { fetch } = makeQueueFetch([
            TOKEN_REPLY,
            { match: () => true, reply: { status: 500, body: { ok: false, error: { code: "unknown", message: "cms boom" } } } },
            { match: () => true, reply: { status: 500, body: { ok: false, error: { code: "unknown", message: "cdn boom" } } } },
            { match: () => true, reply: { status: 200, body: { ok: true, data: { id: `${slug}-delivery` } } } },
            { match: () => true, reply: { status: 204 } },
        ]);
        const hub = new Hub({ ...HUB_CONFIG, fetch });
        try {
            await hub.deprovisionTenant(slug);
            expect.unreachable();
        } catch (e) {
            expect((e as HubError).code).toBe("deprovision_partial");
            expect((e as HubError).message).toMatch(/cms boom/);
            expect((e as HubError).message).toMatch(/cdn boom/);
        }
    });
});
