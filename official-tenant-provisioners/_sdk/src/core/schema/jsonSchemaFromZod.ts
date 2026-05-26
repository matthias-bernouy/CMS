import { z } from "zod";
import { ConfigError } from "src/core/errors";
import type { VisibleIfClause } from "src/core/tenantConfig/isVisible";
import type { WritableRole } from "src/core/tenantConfig/extractWritability";

/** Per-field UI / permission annotations overlaid on a zod-derived JSON Schema.
 *  Keys map to JSON-Schema vocabulary (`title`, `description`, `writeOnly`)
 *  plus the `x-*` extensions (base.md §11.2) — zod stays the single source,
 *  this adds the UX layer. */
export interface FieldAnnotation {
    title?:       string;
    description?: string;
    widget?:      string;                          // → x-widget
    group?:       string;                          // → x-group
    writableBy?:  ReadonlyArray<WritableRole>;     // → x-writable-by
    writeOnly?:   boolean;                         // native JSON Schema
    visibleIf?:   VisibleIfClause;                 // → x-visible-if
}

/**
 * Single source of truth → JSON Schema. Runs `z.toJSONSchema(zod)` then
 * overlays per-field annotations (`title`/`widget`/`group`/`writeOnly`/…).
 * Fails fast on an annotation key absent from the schema (typo). Used by
 * `defineTenantConfig` (§11 config) so a provider never hand-writes JSON Schema.
 */
export function jsonSchemaFromZod(
    zod: z.ZodObject<z.ZodRawShape>,
    annotations?: Record<string, FieldAnnotation>,
): Record<string, unknown> {
    const jsonSchema = z.toJSONSchema(zod) as Record<string, unknown>;
    const baseProps  = (jsonSchema["properties"] ?? {}) as Record<string, Record<string, unknown>>;

    for (const annoKey of Object.keys(annotations ?? {})) {
        if (!(annoKey in baseProps)) {
            throw new ConfigError(`annotation for unknown field "${annoKey}" (not in zod schema)`);
        }
    }

    const enriched: Record<string, Record<string, unknown>> = {};
    for (const [k, p] of Object.entries(baseProps)) {
        const a = annotations?.[k];
        enriched[k] = {
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

    return { ...jsonSchema, properties: enriched };
}
