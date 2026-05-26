import { FakeIssuer } from "tests/helpers/fakeIssuer";
import { BunRunner } from "@bernouy/runner-bun";
import { serveForTest } from "@bernouy/runner-bun/testing";
import { createProvider, type CreateProviderTenantConfig } from "src/exports/createProvider";
import { requestContext } from "src/core/http/requestContext";
import { MemoryLogStore } from "src/default-implementation/MemoryLogStore";
import type { ProviderDomain } from "src/types/ProviderDomain";
import type { ProviderHooks } from "src/interfaces/hooks";

const noopHooks: ProviderHooks = {
    onProvision: async () => {}, onUpdate: async () => {}, onDeprovision: async () => {},
};

export const defaultDomain: ProviderDomain = {
    mount(r) {
        r.get("/notes", (req) => {
            const c = requestContext(req);
            return Response.json({ tenant: c.tenant.tenantId, scope: c.sub ? "user" : "tenant" });
        });
    },
    openapiConsumption: { x: 1 },
    openapiTenant: { y: 2 },
};

export interface MountedOpts {
    domain?:       ProviderDomain;
    hooks?:        ProviderHooks;
    tenantConfig?: CreateProviderTenantConfig;
}

export async function setupMounted(opts: ProviderDomain | MountedOpts = {}) {
    const m: MountedOpts = "mount" in opts ? { domain: opts } : opts;
    const hub = await FakeIssuer.start();
    const tIss = await FakeIssuer.start();
    const provider = createProvider({
        config: { providerId: "prov-1", allowlist: [{ iss: hub.iss, role: "control-plane" }] },
        hooks:  m.hooks  ?? noopHooks,
        domain: m.domain ?? defaultDomain,
        store:  new MemoryLogStore(),     // tests: no on-disk side effects
        ...(m.tenantConfig ? { tenantConfig: m.tenantConfig } : {}),
    });
    const runner = new BunRunner();
    await provider.mount(runner);
    const srv = serveForTest(runner);
    return {
        runner, request: srv.request, url: srv.url, hub, tIss,
        stop: () => { srv.stop(); hub.stop(); tIss.stop(); },
    };
}

export const cpToken = (hub: FakeIssuer) => hub.mint({ aud: "prov-1" });
export const tToken  = (tIss: FakeIssuer, sub?: string) =>
    tIss.mint({ aud: "prov-1", ...(sub ? { sub } : {}) });
export const bearer  = (t: string) => ({ headers: { Authorization: `Bearer ${t}` } });
