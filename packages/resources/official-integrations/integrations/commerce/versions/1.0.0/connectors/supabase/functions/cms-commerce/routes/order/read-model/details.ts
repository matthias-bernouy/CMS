import { cmsUserId } from "../../../core/auth.ts";
import { HttpError } from "../../../core/errors.ts";
import { json } from "../../../core/http.ts";
import { integer, isRecord, text } from "../../../core/records.ts";
import { rpc } from "../../../core/rest.ts";
import type { JsonRecord } from "../../../core/types.ts";
import { parsePublicOrderMetadataDefinitions } from "../../../core/order-metadata.ts";
import {
    type DetailBundle,
    projectOrderDetail,
    projectSaleDetail,
} from "./detail-projections.ts";

type DetailScope = "buyer" | "seller" | "admin";

const functionName = "get_order_detail_read_model";
const optionalKeys = [
    "seller", "operation", "financial_terms", "fulfillment", "settlement",
    "claim", "authorization",
] as const;

export const getMyOrder = (request: Request): Promise<Response> =>
    getOrderDetail(request, "buyer");
export const getAdminOrder = (request: Request): Promise<Response> =>
    getOrderDetail(request, "admin");
export const getMySale = (request: Request): Promise<Response> =>
    getOrderDetail(request, "seller");

async function getOrderDetail(request: Request, scope: DetailScope): Promise<Response> {
    const url = new URL(request.url);
    const id = integer(url.searchParams.get("id"), "id");
    const publicId = text(url.searchParams.get("publicId"));
    if (id === undefined && !publicId) {
        throw new HttpError(400, "id or publicId is required");
    }
    const actor = scope === "seller"
        ? cmsUserId(request)
        : scope === "buyer" ? cmsUserIdOrNull(request) : null;
    const result = await rpc(functionName, {
        p_scope: scope,
        p_cms_user_id: actor,
        p_id: id ?? null,
        p_public_id: id === undefined ? publicId! : null,
    });
    const bundle = readBundle(result, scope, actor);
    return json(scope === "seller"
        ? projectSaleDetail(bundle)
        : projectOrderDetail(bundle, scope === "buyer"));
}

function readBundle(value: unknown, scope: DetailScope, actor: string | null): DetailBundle {
    if (!isRecord(value) || typeof value.state !== "string") throw invalidResponse();
    if (value.state === "not_found") {
        throw new HttpError(404, scope === "seller" ? "sale not found" : "order not found");
    }
    if (value.state === "identity_required" && scope === "buyer" && actor === null) {
        throw new HttpError(401, "missing CMS user id");
    }
    if (value.state !== "ok" || !isRecord(value.order)) throw invalidResponse();
    const lines = recordArray(value.lines);
    const events = recordArray(value.events);
    const definitions = recordArray(value.definitions);
    if (!lines || !events || !definitions || optionalKeys.some(key =>
        value[key] !== null && !isRecord(value[key])
    )) throw invalidResponse();
    if (scope === "seller") {
        if (value.seller !== null || value.claim !== null) throw invalidResponse();
    } else if (value.authorization !== null) {
        throw invalidResponse();
    }
    if (scope === "admin" && definitions.length) throw invalidResponse();
    return {
        order: value.order,
        lines,
        events,
        seller: value.seller as JsonRecord | null,
        operation: value.operation as JsonRecord | null,
        financialTerms: value.financial_terms as JsonRecord | null,
        fulfillment: value.fulfillment as JsonRecord | null,
        settlement: value.settlement as JsonRecord | null,
        claim: value.claim as JsonRecord | null,
        authorization: value.authorization as JsonRecord | null,
        definitions: parsePublicOrderMetadataDefinitions(definitions),
    };
}

function recordArray(value: unknown): JsonRecord[] | null {
    return Array.isArray(value) && value.every(isRecord) ? value : null;
}

function cmsUserIdOrNull(request: Request): string | null {
    return (request.headers.get("x-cms-user-id") ?? "").trim() || null;
}

function invalidResponse(): HttpError {
    return new HttpError(502, `${functionName} returned an invalid response`);
}
