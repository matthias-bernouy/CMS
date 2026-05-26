import { test, expect } from "bun:test";
import { makeExample } from "@bernouy/tenant-provisioner-example";
import { MemoryLogStore } from "@bernouy/tenant-provisioner-sdk";
import {
    createTenantIssuer, buildMetadoc, buildJwks, MemoryKeyStore,
} from "@bernouy/issuer-kit";
import { metadocPath } from "@bernouy/tenant-provisioner-contract";
import { BunRunner } from "@bernouy/runner-bun";
import { serveForTest } from "@bernouy/runner-bun/testing";

/**
 * THE conformance lock (.work/issuer-kit/09): the REAL issuer-kit replaces
 * `FakeIssuer` and drives the reference provider's full lifecycle through
 * the REAL SDK. If sign↔verify drift by a bit, this goes red.
 */
class KitIssuer {
    private constructor(
        private readonly server: ReturnType<typeof Bun.serve>,
        private readonly ti: ReturnType<typeof createTenantIssuer>,
        private readonly ks: MemoryKeyStore,
    ) {}
    static async start(): Promise<KitIssuer> {
        let metaPath = "", jwksPath = "";
        let cfg: ReturnType<typeof createTenantIssuer>["config"] | null = null;
        let ks!: MemoryKeyStore;
        const srv = Bun.serve({
            port: 0,
            fetch: async (req) => {
                const p = new URL(req.url).pathname;
                if (p === metaPath) return Response.json(buildMetadoc(cfg!));
                if (p === jwksPath) return Response.json(await buildJwks(ks));
                return new Response("nf", { status: 404 });
            },
        });
        const iss = `http://127.0.0.1:${srv.port}`;
        ks = new MemoryKeyStore({ now: () => Math.floor(Date.now() / 1000), keyOverlapSeconds: 300 });
        const ti = createTenantIssuer({ issuer: iss, keyStore: ks });
        cfg = ti.config;
        metaPath = new URL(metadocPath(iss)).pathname;
        jwksPath = new URL(cfg.jwksUri).pathname;
        return new KitIssuer(srv, ti, ks);
    }
    get iss(): string { return this.ti.config.issuer; }
    mint(o: { aud: string; sub?: string }): Promise<string> {
        return this.ti.mint(o.sub !== undefined ? { aud: o.aud, sub: o.sub } : { aud: o.aud });
    }
    rotate(): Promise<void> { return this.ti.rotate(); }
    stop(): void { this.server.stop(true); }
}

const bear = (t: string) => ({ headers: { Authorization: `Bearer ${t}` } });

test("REAL issuer-kit ↔ REAL SDK: full provider lifecycle is green", async () => {
    const hub = await KitIssuer.start();   // role: control-plane (via allowlist)
    const t1  = await KitIssuer.start();   // role: tenant
    const r = new BunRunner();
    try {
        const { provider } = makeExample(hub.iss, new MemoryLogStore());
        await provider.mount(r);
        const srv = serveForTest(r);
        const AUD = "notes-provider";
        const cp = () => hub.mint({ aud: AUD });

        // provision (control-plane token signed by the real kit)
        expect((await srv.request("POST", "/admin/tenants", {
            ...bear(await cp()), body: JSON.stringify({ tenantId: "t1", issuers: [t1.iss] }),
        })).status).toBe(200);

        // plane 3 (tenant token + sub) + plane 2
        await srv.request("POST", "/notes", {
            ...bear(await t1.mint({ aud: AUD, sub: "u1" })), body: JSON.stringify({ note: "hi" }),
        });
        expect(await (await srv.request("GET", "/notes", bear(await t1.mint({ aud: AUD })))).json())
            .toEqual({ notes: ["hi"] });
        expect(await (await srv.request("GET", "/tenant/stats", bear(await t1.mint({ aud: AUD })))).json())
            .toEqual({ count: 1 });

        // suspend → 403 ; resume → 200
        await srv.request("PATCH", "/admin/tenants?tenantId=t1", {
            ...bear(await cp()), body: JSON.stringify({ status: "suspended" }),
        });
        expect((await srv.request("GET", "/notes", bear(await t1.mint({ aud: AUD })))).status).toBe(403);
        await srv.request("PATCH", "/admin/tenants?tenantId=t1", {
            ...bear(await cp()), body: JSON.stringify({ status: "active" }),
        });
        expect((await srv.request("GET", "/notes", bear(await t1.mint({ aud: AUD })))).status).toBe(200);

        // key rotation (publish-before-sign) → no false 401
        await t1.rotate();
        expect((await srv.request("GET", "/notes", bear(await t1.mint({ aud: AUD })))).status).toBe(200);

        // tenant token on /admin → 403 (frozen plane guard)
        expect((await srv.request("GET", "/admin/tenants", bear(await t1.mint({ aud: AUD })))).status).toBe(403);

        // deprovision (force) → trust binding gone → 401
        expect((await srv.request("DELETE", "/admin/tenants?tenantId=t1&force=true", bear(await cp()))).status).toBe(204);
        expect((await srv.request("GET", "/notes", bear(await t1.mint({ aud: AUD })))).status).toBe(401);
    } finally { hub.stop(); t1.stop(); r.stop(); }
});
