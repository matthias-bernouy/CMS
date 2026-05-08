import { z } from "./zodInit";

// 1..63 chars, [a-z0-9-], no leading/trailing dash. Same rule as `ProvisionTenantInput.slug`.
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export const DeprovisionTenantQuerySchema = z.object({
    slug: z.string().regex(SLUG_RE).openapi({ example: "acme" }),
});

export const DeprovisionTenantResultSchema = z.object({
    slug: z.string(),
}).openapi("DeprovisionTenantResult");
