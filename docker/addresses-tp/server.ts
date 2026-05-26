// Addresses tenant-provisioner — wraps the French BAN (Base Adresse Nationale).
// Same wiring pattern as docker/example-tp: SDK provider mount + issuer-kit
// metadoc/JWKS. Stateless TP, MemoryLogStore in dev so the unprivileged
// `dp` user doesn't need a writable /app.

import { BunRunner } from "@bernouy/runner-bun";
import { MemoryKeyStore, createTenantIssuer } from "@bernouy/issuer-kit";
import { MemoryLogStore } from "@bernouy/tenant-provisioner-sdk";
import { makeAddresses } from "@bernouy/tenant-provisioner-addresses";

const env = (k: string, d?: string): string => {
    const v = process.env[k];
    if (v) return v;
    if (d !== undefined) return d;
    throw new Error(`env ${k} missing`);
};

const PORT             = Number(process.env.PORT ?? 3000);
const TP_PUBLIC_URL    = env("TP_PUBLIC_URL");
const HUB_ISSUER_URL   = env("HUB_ISSUER_URL");

const runner = new BunRunner();
const { provider } = makeAddresses(HUB_ISSUER_URL, new MemoryLogStore());

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
console.log(`🚀 addresses-tp listening on :${PORT}`);
console.log(`   iss:     ${TP_PUBLIC_URL}`);
console.log(`   trusts:  ${HUB_ISSUER_URL} (role: control-plane)`);
