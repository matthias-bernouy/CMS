// Keycloak tenant-provisioner — dev image. Mounts the Keycloak TP
// (`createKeycloakProvider`) + the issuer-kit metadoc/JWKS so the hub can
// import it and provision realms (1 tenant = 1 realm). It authenticates to
// Keycloak with a client_credentials service account (created by
// keycloak-setup.sh in dev). No automatic cross-TP wiring — provisioning is
// driven manually from the hub.

import { BunRunner } from "@bernouy/runner-bun";
import { MemoryKeyStore, createTenantIssuer } from "@bernouy/issuer-kit";
import { MemoryLogStore } from "@bernouy/tenant-provisioner-sdk";
import { KeycloakAdminClient } from "@bernouy/keycloak-client";
import { createKeycloakProvider } from "@bernouy/tenant-provisioner-keycloak";

const env = (k: string, d?: string): string => {
    const v = process.env[k];
    if (v) return v;
    if (d !== undefined) return d;
    throw new Error(`env ${k} missing`);
};

const PORT             = Number(process.env.PORT ?? 3000);
const TP_PUBLIC_URL    = env("TP_PUBLIC_URL");    // URL the hub fetches this TP at
const HUB_ISSUER_URL   = env("HUB_ISSUER_URL");   // the hub iss (allowlisted)
const KEYCLOAK_BASE_URL = env("KEYCLOAK_BASE_URL");
const SA_REALM         = env("KEYCLOAK_SA_REALM", "master");
const SA_CLIENT_ID     = env("KEYCLOAK_SA_CLIENT_ID");
const SA_CLIENT_SECRET = env("KEYCLOAK_SA_CLIENT_SECRET");

const client = new KeycloakAdminClient({
    baseUrl: KEYCLOAK_BASE_URL,
    auth: { type: "client-credentials", realm: SA_REALM, clientId: SA_CLIENT_ID, clientSecret: SA_CLIENT_SECRET },
});

const runner = new BunRunner();

const provider = createKeycloakProvider({
    client,
    hubIssuer:       HUB_ISSUER_URL,
    keycloakBaseUrl: KEYCLOAK_BASE_URL,
    logStore:        new MemoryLogStore(),
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
console.log(`🚀 keycloak-tp listening on :${PORT}`);
console.log(`   iss:      ${TP_PUBLIC_URL}`);
console.log(`   trusts:   ${HUB_ISSUER_URL} (role: control-plane)`);
console.log(`   keycloak: ${KEYCLOAK_BASE_URL} (sa client: ${SA_CLIENT_ID})`);
