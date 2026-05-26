// Example tenant-provisioner — wraps `makeExample()` from the in-repo
// `_example` package in a BunRunner so the dev compose can spin up a real
// conforming TP for the hub to import. NOT shipped to production.
//
// All env vars come from the docker-compose `environment:` block (no OKMS
// in dev). The TP's iss is the URL the hub fetches it at — must match
// both inside the docker network (`http://example-tp:4000`) and from a
// dev browser hitting the hub's UI (same URL via docker DNS alias).

import { BunRunner } from "@bernouy/runner-bun";
import { MemoryKeyStore, createTenantIssuer } from "@bernouy/issuer-kit";
import { MemoryLogStore } from "@bernouy/tenant-provisioner-sdk";
import { makeExample } from "@bernouy/tenant-provisioner-example";

const env = (k: string, d?: string): string => {
    const v = process.env[k];
    if (v) return v;
    if (d !== undefined) return d;
    throw new Error(`env ${k} missing`);
};

const PORT             = Number(process.env.PORT ?? 3000);
const TP_PUBLIC_URL    = env("TP_PUBLIC_URL");    // e.g. http://example-tp.localtest.me:4000
const HUB_ISSUER_URL   = env("HUB_ISSUER_URL");   // e.g. http://hub.localtest.me:3000

const runner = new BunRunner();
// MemoryLogStore — dev container has no persistent volume + the unprivileged
// `dp` user can't write to /app where FileLogStore defaults. In prod a real
// TP wires a persistent FileLogStore or DB-backed store.
const { provider } = makeExample(HUB_ISSUER_URL, new MemoryLogStore());

// Publish the TP's own RFC 8414 metadoc + JWKS so the hub's import flow
// (discoverEndpoints) can pick up issuer + jwks_uri. createTenantIssuer
// wires parseIssuerConfig + mountIssuer in one call.
const tenantIssuer = createTenantIssuer({
    issuer: TP_PUBLIC_URL,
    keyStore: new MemoryKeyStore({
        now: () => Math.floor(Date.now() / 1000),
        keyOverlapSeconds: 300,
    }),
});
tenantIssuer.mount(runner);

await provider.mount(runner);

runner.start(PORT);
console.log(`🚀 example-tp listening on :${PORT}`);
console.log(`   iss:     ${TP_PUBLIC_URL}`);
console.log(`   trusts:  ${HUB_ISSUER_URL} (role: control-plane)`);
