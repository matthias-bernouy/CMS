import type { z } from "zod";
import type { TenantConfigStore } from "src/interfaces/TenantConfigStore";

/**
 * What the §11 `/admin/config` + `/tenant/config` handlers receive. Built
 * once at composition (`createProvider`) from the `tenantConfig` option.
 *
 * Distinct from `TenantConfigSchema` (the wire shape served at
 * `/openapi.tenant-config.json`) because handlers need the zod schemas
 * (validation) and the store (storage), neither of which is wire-relevant.
 */
export interface TenantConfigContext {
    version: string;
    /** JSON Schema (the same blob served at `/openapi.tenant-config.json`). */
    schema:  Record<string, unknown>;
    /** Full zod schema — used in PATCH after merge for cross-field invariants. */
    zod:     z.ZodTypeAny;
    /** Partial of the same schema — used on the PATCH input body. */
    partial: z.ZodTypeAny;
    /** Persistence capability. */
    store:   TenantConfigStore;
}
