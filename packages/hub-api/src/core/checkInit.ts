import type { BucketsClient } from "@bernouy/cdn-buckets";
import type { MtControlClient } from "@bernouy/mt-cms-control";
import type { KeycloakAdminClient } from "@bernouy/keycloak-client";
import type { HubConfig } from "src/interfaces/HubConfig";
import { HubError } from "./HubError";

/**
 * Pre-flight checks: verify the hub can authenticate with Keycloak AND that the
 * resulting JWT is accepted by both downstream services with the right role mapping.
 * Throws a `HubError` with an actionable code on failure.
 *
 * Takes lazy client getters (rather than pre-built instances) so the Keycloak
 * step's failure is mapped to `keycloak_unreachable` BEFORE the cms/cdn clients
 * try to use the (failed) token.
 */
export async function checkInit(opts: {
    keycloak:     KeycloakAdminClient;
    getCmsClient: () => Promise<MtControlClient>;
    getCdnClient: () => Promise<BucketsClient>;
    config:       HubConfig;
}): Promise<void> {
    // 1. Keycloak token endpoint — verifies creds + connectivity
    try { await opts.keycloak.getAccessToken(); }
    catch (err) {
        throw new HubError("keycloak_unreachable", `Failed to authenticate with Keycloak at ${opts.config.keycloak.baseUrl}: ${msg(err)}`, err);
    }
    // 2. cms-control-mt — verifies the JWT is accepted + role mapping is correct
    try {
        const cms = await opts.getCmsClient();
        await cms.listTenants();
    }
    catch (err) {
        throw new HubError("cms_unreachable", `cms-control-mt at ${opts.config.cms.baseUrl} rejected the JWT (check the 'cms-superadmin' realm role on the service account): ${msg(err)}`, err);
    }
    // 3. cdn-origin — same check, on the other realm role
    try {
        const cdn = await opts.getCdnClient();
        await cdn.listBuckets();
    }
    catch (err) {
        throw new HubError("cdn_unreachable", `cdn-origin at ${opts.config.cdn.baseUrl} rejected the JWT (check the 'admin' realm role on the service account): ${msg(err)}`, err);
    }
}

function msg(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}
