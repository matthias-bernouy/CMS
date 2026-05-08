import { describe, test, expect } from "bun:test";
import type { Hub } from "src/exports/Hub";
import { HubError } from "src/core/HubError";
import handleProvision   from "src/api/tenants/tenants.post";
import handleDeprovision from "src/api/tenants/tenants.delete";
import handlePreflight   from "src/api/preflight.get";

/** Minimal `Hub` stand-in — only the methods the tests exercise are populated. */
function fakeHub(impl: Partial<{
    provisionTenant:   Hub["provisionTenant"];
    deprovisionTenant: Hub["deprovisionTenant"];
    init:              Hub["init"];
}>): Hub {
    return impl as unknown as Hub;
}

const VALID_BODY = {
    slug: "acme",
    name: "ACME",
    adminUser: { username: "matt", email: "matt@acme.com" },
};

describe("POST /api/tenants", () => {
    test("happy path: 201 with `{ ok, data }`", async () => {
        const hub = fakeHub({
            provisionTenant: async () => ({
                slug: "acme", realm: "acme", keycloakClientId: "cms", keycloakRoleName: "admin",
                assetsBucketId: "acme-assets", welcomeEmailSentTo: "matt@acme.com",
            }),
        });
        const req = new Request("http://x/api/tenants", { method: "POST", body: JSON.stringify(VALID_BODY) });
        const res = await handleProvision(req, hub);
        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.data.slug).toBe("acme");
    });

    test("invalid JSON body → 400 validation_error", async () => {
        const hub = fakeHub({});
        const req = new Request("http://x/api/tenants", { method: "POST", body: "{not json" });
        const res = await handleProvision(req, hub);
        expect(res.status).toBe(400);
        expect((await res.json()).error.code).toBe("validation_error");
    });

    test("DTO rejected → 400 validation_error", async () => {
        const hub = fakeHub({});
        const req = new Request("http://x/api/tenants", { method: "POST", body: JSON.stringify({ ...VALID_BODY, slug: "INVALID" }) });
        const res = await handleProvision(req, hub);
        expect(res.status).toBe(400);
    });

    test("provision_failed → 502 with code preserved", async () => {
        const hub = fakeHub({
            provisionTenant: async () => { throw new HubError("provision_failed", "kc went sideways"); },
        });
        const req = new Request("http://x/api/tenants", { method: "POST", body: JSON.stringify(VALID_BODY) });
        const res = await handleProvision(req, hub);
        expect(res.status).toBe(502);
        const body = await res.json();
        expect(body.error.code).toBe("provision_failed");
        expect(body.error.message).toMatch(/kc went sideways/);
    });
});

describe("DELETE /api/tenants?slug=", () => {
    test("happy path: 200 with `{ ok, data: { slug } }`", async () => {
        const hub = fakeHub({ deprovisionTenant: async () => undefined });
        const req = new Request("http://x/api/tenants?slug=acme", { method: "DELETE" });
        const res = await handleDeprovision(req, hub);
        expect(res.status).toBe(200);
        expect((await res.json()).data.slug).toBe("acme");
    });

    test("missing slug → 400", async () => {
        const hub = fakeHub({});
        const req = new Request("http://x/api/tenants", { method: "DELETE" });
        const res = await handleDeprovision(req, hub);
        expect(res.status).toBe(400);
    });

    test("malformed slug → 400 (e.g. uppercase)", async () => {
        const hub = fakeHub({});
        const req = new Request("http://x/api/tenants?slug=ACME", { method: "DELETE" });
        const res = await handleDeprovision(req, hub);
        expect(res.status).toBe(400);
    });

    test("HubError surfaces with its code", async () => {
        const hub = fakeHub({
            deprovisionTenant: async () => { throw new HubError("deprovision_partial", "kc 500"); },
        });
        const req = new Request("http://x/api/tenants?slug=acme", { method: "DELETE" });
        const res = await handleDeprovision(req, hub);
        expect(res.status).toBe(500);
        expect((await res.json()).error.code).toBe("deprovision_partial");
    });
});

describe("GET /api/preflight", () => {
    test("init OK → 200 ready", async () => {
        const hub = fakeHub({ init: async () => undefined });
        const res = await handlePreflight(new Request("http://x/api/preflight"), hub);
        expect(res.status).toBe(200);
        expect((await res.json()).data.status).toBe("ready");
    });

    test("init throws HubError → 503 with code preserved", async () => {
        const hub = fakeHub({ init: async () => { throw new HubError("cms_unreachable", "down"); } });
        const res = await handlePreflight(new Request("http://x/api/preflight"), hub);
        expect(res.status).toBe(503);
        expect((await res.json()).error.code).toBe("cms_unreachable");
    });
});
