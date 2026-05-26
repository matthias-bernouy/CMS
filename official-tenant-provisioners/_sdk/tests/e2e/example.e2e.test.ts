import { test, expect } from "bun:test";
import { makeExample } from "@bernouy/tenant-provisioner-example";
import { MemoryLogStore } from "@bernouy/tenant-provisioner-sdk";
import { FakeIssuer } from "tests/helpers/fakeIssuer";
import { BunRunner } from "@bernouy/runner-bun";
import { serveForTest } from "@bernouy/runner-bun/testing";

const AUD = "notes-provider";
const bear = (t: string) => ({ headers: { Authorization: `Bearer ${t}` } });

async function setup() {
    const hub = await FakeIssuer.start();
    const t1 = await FakeIssuer.start();
    const t2 = await FakeIssuer.start();
    const { provider } = makeExample(hub.iss, new MemoryLogStore());
    const runner = new BunRunner();
    await provider.mount(runner);
    const srv = serveForTest(runner);
    const cp = () => hub.mint({ aud: AUD });
    return { request: srv.request, hub, t1, t2, cp, stop: () => { srv.stop(); hub.stop(); t1.stop(); t2.stop(); } };
}
const prov = (s: Awaited<ReturnType<typeof setup>>, id: string, iss: FakeIssuer) =>
    s.cp().then((t) => s.request("POST", "/admin/tenants",
        { ...bear(t), body: JSON.stringify({ tenantId: id, issuers: [iss.iss] }) }));

test("full lifecycle: provision → use → isolate → suspend → resume → rotate → deprovision", async () => {
    const s = await setup();
    try {
        expect((await prov(s, "t1", s.t1)).status).toBe(200);
        expect((await prov(s, "t2", s.t2)).status).toBe(200);

        // plane 3 + plane 2, isolated per tenant
        await s.request("POST", "/notes", { ...bear(await s.t1.mint({ aud: AUD, sub: "u1" })), body: JSON.stringify({ note: "hi" }) });
        await s.request("POST", "/notes", { ...bear(await s.t2.mint({ aud: AUD })), body: JSON.stringify({ note: "other" }) });
        expect(await (await s.request("GET", "/notes", bear(await s.t1.mint({ aud: AUD })))).json()).toEqual({ notes: ["hi"] });
        expect(await (await s.request("GET", "/notes", bear(await s.t2.mint({ aud: AUD })))).json()).toEqual({ notes: ["other"] });
        expect(await (await s.request("GET", "/tenant/stats", bear(await s.t1.mint({ aud: AUD })))).json()).toEqual({ count: 1 });

        // suspend → 403 ; resume → 200 (invalidate ⇒ immediate)
        await s.request("PATCH", "/admin/tenants?tenantId=t1", { ...bear(await s.cp()), body: JSON.stringify({ status: "suspended" }) });
        expect((await s.request("GET", "/notes", bear(await s.t1.mint({ aud: AUD })))).status).toBe(403);
        await s.request("PATCH", "/admin/tenants?tenantId=t1", { ...bear(await s.cp()), body: JSON.stringify({ status: "active" }) });
        expect((await s.request("GET", "/notes", bear(await s.t1.mint({ aud: AUD })))).status).toBe(200);

        // key rotation: new signing key, JWKS overlap → no false 401
        const kid2 = await s.t1.rotateKey();
        expect((await s.request("GET", "/notes", bear(await s.t1.mint({ aud: AUD, kid: kid2 })))).status).toBe(200);

        // deprovision (force) → namespace dropped, trust binding gone
        expect((await s.request("DELETE", "/admin/tenants?tenantId=t1&force=true", bear(await s.cp()))).status).toBe(204);
        expect((await s.request("GET", "/notes", bear(await s.t1.mint({ aud: AUD })))).status).toBe(401);
    } finally { s.stop(); }
});

test("tenant token on /admin/* → 403 (frozen plane guard, any provider)", async () => {
    const s = await setup();
    try {
        await prov(s, "t1", s.t1);
        const r = await s.request("GET", "/admin/tenants", bear(await s.t1.mint({ aud: AUD })));
        expect(r.status).toBe(403);
    } finally { s.stop(); }
});
