// CMS tenant-provisioner — dev image. Mounts the CMS as a conforming tenant-provisioner
// (`createCmsProvider`) + the issuer-kit metadoc/JWKS so the hub can import it,
// provision per-tenant CMS spaces, and set their config. The CMS admin UI
// (ControlCms) and public delivery (DeliveryCms) are NOT mounted here — they
// are separate, cookie-gated frontends (a later step).
//
// Per-tenant CMS data lives in Mongo, isolated by collection prefix
// (`tenant_<id>__*`). Logs are in-memory (dev container has no writable
// volume for the unprivileged user; prod wires a persistent/DB log store).

import { MongoClient } from "mongodb";
import { BunRunner } from "@bernouy/runner-bun";
import { MemoryKeyStore, createTenantIssuer } from "@bernouy/issuer-kit";
import { MemoryLogStore } from "@bernouy/tenant-provisioner-sdk";
import { createCmsProvider } from "@bernouy/tenant-provisioner-cms-control";

const env = (k: string, d?: string): string => {
    const v = process.env[k];
    if (v) return v;
    if (d !== undefined) return d;
    throw new Error(`env ${k} missing`);
};

const PORT           = Number(process.env.PORT ?? 3000);
const TP_PUBLIC_URL  = env("TP_PUBLIC_URL");   // URL the hub fetches this TP at
const HUB_ISSUER_URL = env("HUB_ISSUER_URL");  // the hub iss (allowlisted)
const MONGO_URL      = env("MONGO_URL");
const MONGO_DB_NAME  = env("MONGO_DB_NAME", "cms_dev");

const mongo = new MongoClient(MONGO_URL);
await mongo.connect();
const db = mongo.db(MONGO_DB_NAME);

const runner = new BunRunner();

const provider = createCmsProvider({
    db,
    hubIssuer: HUB_ISSUER_URL,
    logStore:  new MemoryLogStore(),
});

// Publish the TP's RFC 8414 metadoc + JWKS so the hub's import flow
// (discoverEndpoints) can pick up issuer + jwks_uri.
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
console.log(`🚀 cms-tp listening on :${PORT}`);
console.log(`   iss:     ${TP_PUBLIC_URL}`);
console.log(`   trusts:  ${HUB_ISSUER_URL} (role: control-plane)`);
console.log(`   mongo:   ${MONGO_DB_NAME}`);
