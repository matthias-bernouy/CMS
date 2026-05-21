import { test, expect } from "bun:test";
import { setupMounted, cpToken, tToken, bearer } from "tests/helpers/mountSetup";
import { requestContext } from "src/core/http/requestContext";
import { requestRecorder } from "src/core/http/requestRecorder";
import { SdkError } from "src/core/errors";
import type { ProviderDomain } from "src/types/ProviderDomain";

async function provision(s: Awaited<ReturnType<typeof setupMounted>>) {
    return s.request("POST", "/admin/tenants", {
        ...bearer(await cpToken(s.hub)),
        body: JSON.stringify({ tenantId: "t1", issuers: [s.tIss.iss] }),
    });
}

test("control-plane provisions; Memory registry default lists it", async () => {
    const s = await setupMounted();
    try {
        expect((await provision(s)).status).toBe(200);
        const list = await (await s.request("GET", "/admin/tenants", bearer(await cpToken(s.hub)))).json();
        expect(list.tenants.map((t: { tenantId: string }) => t.tenantId)).toEqual(["t1"]);
    } finally { s.stop(); }
});

test("imposed order: no token → 401; tenant token on /admin → 403 (verify ran, then planGuard)", async () => {
    const s = await setupMounted();
    try {
        await provision(s);                                   // tIss now resolves as role tenant
        const noTok = await s.request("POST", "/admin/tenants", { body: "{}" });
        expect(noTok.status).toBe(401);
        const wrongPlane = await s.request("POST", "/admin/tenants", {
            ...bearer(await tToken(s.tIss)),
            body: JSON.stringify({ tenantId: "x", issuers: [s.tIss.iss] }),
        });
        expect(wrongPlane.status).toBe(403);
        expect(wrongPlane.headers.get("Content-Type")).toBe("application/problem+json");
    } finally { s.stop(); }
});

test("domain route: middleware cannot be bypassed; handler gets ProviderContext", async () => {
    const s = await setupMounted();
    try {
        await provision(s);
        expect((await s.request("GET", "/notes")).status).toBe(401);   // no token → blocked
        const tenant = await s.request("GET", "/notes", bearer(await tToken(s.tIss)));
        expect(await tenant.json()).toEqual({ tenant: "t1", scope: "tenant" });
        const user = await s.request("GET", "/notes", bearer(await tToken(s.tIss, "opaque-9")));
        expect(await user.json()).toEqual({ tenant: "t1", scope: "user" });
    } finally { s.stop(); }
});

test("tenant token on /tenant/logs (SDK-owned) → 200, redacted page", async () => {
    const s = await setupMounted();
    try {
        await provision(s);
        const res = await s.request("GET", "/tenant/logs", bearer(await tToken(s.tIss)));
        expect(res.status).toBe(200);
        expect(Array.isArray((await res.json()).items)).toBe(true);
    } finally { s.stop(); }
});

async function securityEvents(s: Awaited<ReturnType<typeof setupMounted>>): Promise<string[]> {
    const r = await s.request("GET", "/admin/logs?kind=security",
        bearer(await cpToken(s.hub)));
    return (await r.json()).items.map((x: { event: string }) => x.event);
}

test("security log: auth.bearer_missing emitted when Bearer absent", async () => {
    const s = await setupMounted();
    try {
        expect((await s.request("GET", "/notes")).status).toBe(401);
        expect(await securityEvents(s)).toContain("auth.bearer_missing");
    } finally { s.stop(); }
});

test("security log: plane.denied emitted on tenant→/admin", async () => {
    const s = await setupMounted();
    try {
        await provision(s);
        const r = await s.request("GET", "/admin/tenants", bearer(await tToken(s.tIss)));
        expect(r.status).toBe(403);
        expect(await securityEvents(s)).toContain("plane.denied");
    } finally { s.stop(); }
});

test("security log: tenant.suspended emitted when suspended tenant tries to use the API", async () => {
    const s = await setupMounted();
    try {
        await provision(s);
        await s.request("PATCH", "/admin/tenants?tenantId=t1", {
            ...bearer(await cpToken(s.hub)),
            body: JSON.stringify({ status: "suspended" }),
        });
        const r = await s.request("GET", "/notes", bearer(await tToken(s.tIss)));
        expect(r.status).toBe(403);
        expect(await securityEvents(s)).toContain("tenant.suspended");
    } finally { s.stop(); }
});

test("requestRecorder is exposed to domain handlers (#2) + guarded outside middleware", async () => {
    const domain: ProviderDomain = {
        mount(r) {
            r.get("/probe", (req) => {
                const { tenant } = requestContext(req);
                void requestRecorder(req).record({
                    kind: "request", level: "info", event: "request.served",
                    tenantId: tenant.tenantId, actor: "tenant", visibility: "both",
                    ctx: { probe: true },
                });
                return new Response(null, { status: 204 });
            });
        },
        openapiConsumption: {}, openapiTenant: {},
    };
    const s = await setupMounted(domain);
    try {
        await provision(s);
        expect((await s.request("GET", "/probe", bearer(await tToken(s.tIss)))).status).toBe(204);
        const logs = await (await s.request("GET", "/admin/logs?kind=request",
            bearer(await cpToken(s.hub)))).json();
        expect(logs.items.some((r: { ctx?: { probe?: boolean } }) => r.ctx?.probe === true)).toBe(true);
    } finally { s.stop(); }
    // outside the SDK middleware → guarded
    expect(() => requestRecorder(new Request("http://x/y"))).toThrow(SdkError);
});
