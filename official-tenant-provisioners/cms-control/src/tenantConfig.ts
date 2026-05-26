import { z } from "zod";
import { defineTenantConfig } from "@bernouy/tenant-provisioner-sdk";

/**
 * Per-tenant config the **hub** sets when provisioning a CMS instance
 * (base.md §11). Intentionally minimal: only the bootstrap admin for the
 * tenant's **admin space**. Admin OIDC is **platform-level** — one shared
 * realm + client for all tenants, configured once at the TP deployment (via
 * env), not per-tenant. Everything else (site name, host, language, theme,
 * media bucket, …) is configured inside the CMS admin itself — the hub neither
 * sees nor manages it.
 *
 * All fields are control-plane-writable — operator concern, not tenant
 * self-service (the `/tenant/config` PATCH path does NOT notify our hooks).
 */
const CmsConfigShape = z.object({
    initialAdminEmail: z.string().email(),  // bootstrap admin — authZ lives in the CMS
});

export const CMS_TENANT_CONFIG = defineTenantConfig({
    version: "3.0",
    zod:     CmsConfigShape,
    title:   "CMS tenant config",
    defaultWritableBy: ["control-plane"],
    annotations: {
        initialAdminEmail: { title: "Initial admin email", widget: "text", group: "Admin auth" },
    },
});

export type CmsTenantConfig = z.infer<typeof CmsConfigShape>;
