import { z } from "zod";
import { defineTenantConfig } from "@bernouy/tenant-provisioner-sdk";

/**
 * Per-tenant config the **hub** sets when provisioning a CMS instance
 * (base.md §11). Intentionally minimal: only the OIDC essentials for the
 * tenant's **admin space**. Everything else (site name, host, language,
 * theme, media bucket, …) is configured inside the CMS admin itself — the
 * hub neither sees nor manages it.
 *
 * Keys are flat (not a nested `oidc` object) so the client secret can be
 * `writeOnly` on its own: `stripWriteOnly` is shallow (top-level fields only).
 * All fields are control-plane-writable — operator concern, not tenant
 * self-service (the `/tenant/config` PATCH path does NOT notify our hooks).
 */
const CmsConfigShape = z.object({
    oidcIssuer:        z.string().min(1),   // shared realm issuer URL (authN only)
    oidcClientId:      z.string().min(1),   // shared confidential client for admin login
    oidcClientSecret:  z.string().min(1),   // that client's secret (write-only)
    initialAdminEmail: z.string().email(),  // bootstrap admin — authZ lives in the CMS
});

export const CMS_TENANT_CONFIG = defineTenantConfig({
    version: "3.0",
    zod:     CmsConfigShape,
    title:   "CMS tenant config",
    defaultWritableBy: ["control-plane"],
    annotations: {
        oidcIssuer:        { title: "Admin OIDC issuer",        widget: "text", group: "Admin auth" },
        oidcClientId:      { title: "Admin OIDC client ID",     widget: "text", group: "Admin auth" },
        oidcClientSecret:  { title: "Admin OIDC client secret", widget: "text", group: "Admin auth", writeOnly: true },
        initialAdminEmail: { title: "Initial admin email",      widget: "text", group: "Admin auth" },
    },
});

export type CmsTenantConfig = z.infer<typeof CmsConfigShape>;
