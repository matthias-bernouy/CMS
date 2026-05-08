import { z } from "./zodInit";
import { BucketDefaultsPartialSchema } from "./bucketDefaults";

// 1..63 chars, [a-z0-9-], no leading/trailing dash. Matches RFC 1123 label rules.
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export const ProvisionTenantInputSchema = z.object({

    slug: z.string().regex(SLUG_RE).openapi({
        description: "URL-safe slug. Used as the realm name, the CMS tenant id, the bucket prefix.",
        example:     "acme",
    }),

    name: z.string().min(1).max(200).openapi({
        description: "Human-readable display name (Keycloak realm + CMS tenant + welcome email).",
        example:     "ACME Corp",
    }),

    adminUser: z.object({
        username:   z.string().min(1).openapi({ example: "matthias" }),
        email:      z.email().openapi({ example: "matthias@acme.com" }),
        firstName:  z.string().optional(),
        lastName:   z.string().optional(),
    }).openapi("ProvisionTenantAdminUser"),

    bucketOverrides:            BucketDefaultsPartialSchema.optional(),
    publicAlias:                z.string().optional().openapi({ description: "Public alias domain (e.g. 'acme.com'). Implies a delivery bucket is created." }),
    deliveryEnabled:            z.boolean().optional().openapi({ description: "Enable delivery from the start. Implies a delivery bucket is created." }),
    welcomeRedirectUri:         z.string().optional().openapi({ description: "Where the user lands after clicking the welcome magic link." }),
    welcomeLinkLifespanSeconds: z.number().int().positive().optional().openapi({ description: "TTL of the welcome magic link, in seconds. Default = 7 days." }),

}).openapi("ProvisionTenantInput");

export const ProvisionTenantResultSchema = z.object({
    slug:                z.string(),
    realm:               z.string(),
    keycloakClientId:    z.string(),
    keycloakRoleName:    z.string(),
    assetsBucketId:      z.string(),
    deliveryBucketId:    z.string().optional(),
    welcomeEmailSentTo:  z.email(),
}).openapi("ProvisionTenantResult");

/** Type aliases inferred from the Zod schemas — single source of truth across the codebase. */
export type ProvisionTenantInput  = z.infer<typeof ProvisionTenantInputSchema>;
export type ProvisionTenantResult = z.infer<typeof ProvisionTenantResultSchema>;
