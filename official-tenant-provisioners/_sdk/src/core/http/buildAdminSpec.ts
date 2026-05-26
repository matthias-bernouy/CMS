import { z } from "zod";
import type { ProviderConfig } from "src/interfaces/ProviderConfig";
import { ADMIN_OPERATIONS } from "src/core/http/adminOperations";

type JsonObj = Record<string, unknown>;

function schema(s: z.ZodTypeAny): JsonObj {
    return z.toJSONSchema(s) as JsonObj;
}

function queryParams(q: z.ZodObject<z.ZodRawShape> | undefined): JsonObj[] {
    if (!q) return [];
    const js = schema(q);
    const props = (js["properties"] ?? {}) as Record<string, unknown>;
    const required = new Set((js["required"] as string[] | undefined) ?? []);
    return Object.entries(props).map(([name, sc]) => ({
        name, in: "query", required: required.has(name), schema: sc,
    }));
}

/**
 * Generate `/openapi.admin.json` from the frozen `meta` of `api/admin/*`
 * (base.md §9 — SDK-emitted, identical for every provider, so the hub's
 * one generic client always matches). Declares the provider's default
 * deprovision policy (§9).
 */
export function buildAdminSpec(config: ProviderConfig): JsonObj {
    const paths: JsonObj = {};
    for (const op of ADMIN_OPERATIONS) {
        const m = op.meta;
        const operation: JsonObj = {
            summary: m.summary, operationId: m.operationId, tags: m.tags,
            ...(m.description ? { description: m.description } : {}),
            parameters: queryParams(m.request?.query),
            responses: Object.fromEntries(
                Object.entries(m.responses).map(([code, r]) => [code, {
                    description: r.description,
                    // 204 (and other empty-body responses) have no schema.
                    ...(r.schema ? { content: { "application/json": { schema: schema(r.schema) } } } : {}),
                }]),
            ),
        };
        if (m.request?.body) {
            operation["requestBody"] = {
                required: true,
                content: { "application/json": { schema: schema(m.request.body) } },
            };
        }
        const entry = (paths[op.path] ?? {}) as JsonObj;
        entry[op.method] = operation;
        paths[op.path] = entry;
    }

    return {
        openapi: "3.0.3",
        info: {
            title: `${config.providerId} — control-plane (plane 1)`,
            version: config.supportedContractVersion,
        },
        "x-tenant-provisioner": {
            contractVersion: config.supportedContractVersion,
            defaultDeprovisionPolicy: config.defaultDeprovisionPolicy,
        },
        paths,
    };
}
