import type { BucketsClient } from "@bernouy/cdn-buckets";
import type { MtControlClient } from "@bernouy/mt-cms-control";
import type { KeycloakAdminClient } from "@bernouy/keycloak-client";
import { KeycloakClientError } from "@bernouy/keycloak-client";
import { HubError } from "./HubError";

/**
 * Deletes the tenant across all three services in dependency order. Tolerates
 * `not_found` everywhere (the resource may already be gone). Other errors are
 * collected and surfaced as a single `HubError("deprovision_partial")`.
 */
export async function deprovisionTenant(opts: {
    keycloak: KeycloakAdminClient;
    cms:      MtControlClient;
    cdn:      BucketsClient;
    slug:     string;
}): Promise<void> {
    const errors: Error[] = [];

    // CMS tenant first: removes the runtime mount + tenant row.
    await ignoreNotFound(() => opts.cms.deleteTenant(opts.slug)).catch(e => errors.push(e));
    // Buckets — pure storage, safe to delete after the consumer is gone.
    await ignoreNotFound(() => opts.cdn.deleteBucket(`${opts.slug}-assets`))  .catch(e => errors.push(e));
    await ignoreNotFound(() => opts.cdn.deleteBucket(`${opts.slug}-delivery`)).catch(e => errors.push(e));
    // Keycloak realm — cascade-deletes its clients, roles, users in one call.
    await ignoreNotFound(() => opts.keycloak.deleteRealm(opts.slug))          .catch(e => errors.push(e));

    if (errors.length) {
        throw new HubError("deprovision_partial", `Some resources for "${opts.slug}" failed to delete: ${errors.map(e => e.message).join("; ")}`, errors);
    }
}

async function ignoreNotFound<T>(fn: () => Promise<T>): Promise<T | null> {
    try { return await fn(); }
    catch (e) {
        const code = (e as { code?: string }).code;
        if (code === "not_found") return null;
        if (e instanceof KeycloakClientError && e.code === "not_found") return null;
        throw e;
    }
}
