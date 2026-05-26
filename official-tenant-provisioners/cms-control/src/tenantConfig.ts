import { z } from "zod";
import { defineTenantConfig } from "@bernouy/tenant-provisioner-sdk";

/**
 * Per-tenant CMS config the **hub operator** sets (base.md §11). These are the
 * platform-level site identity knobs — distinct from what a CMS admin edits
 * in-app (favicon, notFound page, …) through ControlCms. They map onto the
 * tenant's `system.site` record via the provision/update hooks.
 *
 * All fields are `control-plane`-writable only: they're operator concerns, not
 * tenant self-service (which avoids the `/tenant/config` PATCH path that does
 * NOT notify our hooks — only the control-plane PATCH calls `onUpdate`).
 */
const CmsConfigShape = z.object({
    siteName: z.string().default(""),
    host:     z.string().default(""),   // canonical base URL
    language: z.string().default(""),   // BCP-47 tag
    theme:    z.string().default(""),   // raw theme CSS
});

export const CMS_TENANT_CONFIG = defineTenantConfig({
    version: "1.0",
    zod:     CmsConfigShape,
    title:   "CMS tenant config",
    defaultWritableBy: ["control-plane"],
    annotations: {
        siteName: { title: "Site name",                 widget: "text",     group: "Identity" },
        host:     { title: "Canonical host (base URL)",  widget: "text",     group: "Identity" },
        language: { title: "Language (BCP-47)",          widget: "text",     group: "Identity" },
        theme:    { title: "Theme CSS",                  widget: "textarea", group: "Appearance" },
    },
});

export type CmsTenantConfig = z.infer<typeof CmsConfigShape>;
