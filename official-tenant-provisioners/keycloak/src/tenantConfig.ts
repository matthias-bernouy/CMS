import { z } from "zod";
import { defineTenantConfig } from "@bernouy/tenant-provisioner-sdk";

/**
 * Per-tenant Keycloak realm config the **hub operator** sets (base.md §11).
 * The realm in Keycloak is the authoritative state; this is the operator's
 * lever on it. `control-plane`-writable only — realms are operator-managed,
 * not tenant self-service.
 */
const KeycloakConfigShape = z.object({
    displayName: z.string().default(""),
    enabled:     z.boolean().default(true),
});

export const KEYCLOAK_TENANT_CONFIG = defineTenantConfig({
    version: "1.0",
    zod:     KeycloakConfigShape,
    title:   "Keycloak realm config",
    defaultWritableBy: ["control-plane"],
    annotations: {
        displayName: { title: "Realm display name", widget: "text",   group: "Realm" },
        enabled:     { title: "Enabled",             widget: "toggle", group: "Realm" },
    },
});

export type KeycloakTenantConfig = z.infer<typeof KeycloakConfigShape>;
