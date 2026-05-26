import { z } from "zod";
import { ConfigError } from "src/core/errors";
import type { TenantConfigSchema } from "src/interfaces/TenantConfigSchema";
import type { VisibleIfClause } from "src/core/tenantConfig/isVisible";
import type { WritableRole } from "src/core/tenantConfig/extractWritability";

/** Per-field UI / permission annotations. The keys map to JSON-Schema
 *  vocabulary (`title`, `description`, `writeOnly`) plus the `x-*`
 *  extensions documented in base.md §11.2 / `_tenantprovisioner_config/02`. */
export interface FieldAnnotation {
    title?:       string;
    description?: string;
    widget?:      string;                                 // → x-widget
    group?:       string;                                 // → x-group
    writableBy?:  ReadonlyArray<WritableRole>;            // → x-writable-by
    writeOnly?:   boolean;                                // native JSON Schema
    visibleIf?:   VisibleIfClause;                        // → x-visible-if
}

export interface DefineTenantConfigOptions<S extends z.ZodObject<z.ZodRawShape>> {
    version: string;
    zod:     S;
    annotations?:      Record<string, FieldAnnotation>;
    defaultWritableBy?: ReadonlyArray<WritableRole>;
    title?:            string;
}

/**
 * Ergonomic factory that takes a zod schema as the **single source of
 * truth** and emits a `TenantConfigSchema` (JSON Schema + `x-*`
 * annotations) ready for `createProvider({ tenantConfig })`. Returns the
 * zod schema (for `.parse()` in hooks) and its `.partial()` (for PATCH
 * validation) alongside.
 *
 * Fails fast on a typo'd annotation key (key absent from the schema's
 * properties) → `ConfigError`. Pattern recommended by base.md §11.2.
 */
export function defineTenantConfig<S extends z.ZodObject<z.ZodRawShape>>(
    opts: DefineTenantConfigOptions<S>,
): TenantConfigSchema & { zod: S; partial: ReturnType<S["partial"]> } {
    const jsonSchema = z.toJSONSchema(opts.zod) as Record<string, unknown>;
    const baseProps  = (jsonSchema["properties"] ?? {}) as Record<string, Record<string, unknown>>;

    // Fail fast on typos
    for (const annoKey of Object.keys(opts.annotations ?? {})) {
        if (!(annoKey in baseProps)) {
            throw new ConfigError(`annotation for unknown field "${annoKey}" (not in zod schema)`);
        }
    }

    const enrichedProps: Record<string, Record<string, unknown>> = {};
    for (const [k, p] of Object.entries(baseProps)) {
        const a = opts.annotations?.[k];
        enrichedProps[k] = {
            ...p,
            ...(a?.title       !== undefined ? { title: a.title } : {}),
            ...(a?.description !== undefined ? { description: a.description } : {}),
            ...(a?.writeOnly                 ? { writeOnly: true } : {}),
            ...(a?.widget      !== undefined ? { "x-widget": a.widget } : {}),
            ...(a?.group       !== undefined ? { "x-group":  a.group } : {}),
            ...(a?.writableBy  !== undefined ? { "x-writable-by": [...a.writableBy] } : {}),
            ...(a?.visibleIf   !== undefined ? { "x-visible-if":  a.visibleIf } : {}),
        };
    }

    const schema: Record<string, unknown> = {
        ...jsonSchema,
        ...(opts.title             !== undefined ? { title: opts.title } : {}),
        ...(opts.defaultWritableBy !== undefined ? { defaultWritableBy: [...opts.defaultWritableBy] } : {}),
        properties: enrichedProps,
    };

    return {
        version: opts.version,
        schema,
        zod:     opts.zod,
        partial: opts.zod.partial() as ReturnType<S["partial"]>,
    };
}
