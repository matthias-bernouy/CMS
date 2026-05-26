import { z } from "zod";
import type { TenantConfigSchema } from "src/interfaces/TenantConfigSchema";
import type { WritableRole } from "src/core/tenantConfig/extractWritability";
import { jsonSchemaFromZod, type FieldAnnotation } from "src/core/schema/jsonSchemaFromZod";

export type { FieldAnnotation };

export interface DefineTenantConfigOptions<S extends z.ZodObject<z.ZodRawShape>> {
    version: string;
    zod:     S;
    annotations?:      Record<string, FieldAnnotation>;
    defaultWritableBy?: ReadonlyArray<WritableRole>;
    title?:            string;
}

/**
 * Ergonomic factory that takes a zod schema as the **single source of truth**
 * and emits a `TenantConfigSchema` (JSON Schema + `x-*` annotations) ready for
 * `createProvider({ tenantConfig })`. Returns the zod schema (for `.parse()` in
 * hooks) and its `.partial()` (for PATCH validation) alongside.
 *
 * JSON-Schema derivation + annotation overlay is shared with management forms
 * via `jsonSchemaFromZod` (so the rule "zod is the only source" holds
 * everywhere). Fails fast on a typo'd annotation key. Pattern: base.md §11.2.
 */
export function defineTenantConfig<S extends z.ZodObject<z.ZodRawShape>>(
    opts: DefineTenantConfigOptions<S>,
): TenantConfigSchema & { zod: S; partial: ReturnType<S["partial"]> } {
    const schema: Record<string, unknown> = {
        ...jsonSchemaFromZod(opts.zod, opts.annotations),
        ...(opts.title             !== undefined ? { title: opts.title } : {}),
        ...(opts.defaultWritableBy !== undefined ? { defaultWritableBy: [...opts.defaultWritableBy] } : {}),
    };

    return {
        version: opts.version,
        schema,
        zod:     opts.zod,
        partial: opts.zod.partial() as ReturnType<S["partial"]>,
    };
}
