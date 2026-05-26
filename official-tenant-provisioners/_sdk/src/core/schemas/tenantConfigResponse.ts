import { z } from "zod";

/** Response shape of `/admin/config` and `/tenant/config` (base.md §11.3 / §11.5).
 *  `version` echoes the schema version the provider declared. */
export const TenantConfigResponseSchema = z.object({
    version: z.string(),
    config:  z.record(z.string(), z.unknown()),
});

/** Body of `PATCH /tenant/config` — accepts a partial-object body; validation
 *  is delegated to the provider's zod `partial`. */
export const TenantConfigPatchBodySchema = z.record(z.string(), z.unknown());
