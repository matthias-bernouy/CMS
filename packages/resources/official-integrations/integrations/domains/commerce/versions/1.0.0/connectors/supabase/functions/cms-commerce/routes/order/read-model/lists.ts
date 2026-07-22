import { cmsUserId } from "../../../core/auth.ts";
import { HttpError } from "../../../core/errors.ts";
import { json } from "../../../core/http.ts";
import { integer, isRecord, text } from "../../../core/records.ts";
import { rpc } from "../../../core/rest.ts";
import type { JsonRecord } from "../../../core/types.ts";
import {
    parsePublicOrderMetadataDefinitions,
    type PublicOrderMetadataDefinition,
} from "../../../core/order-metadata.ts";
import { projectOrderListItem, projectSaleListItem } from "./projections.ts";

type ListScope = "buyer" | "seller" | "admin";
type ListEnvelope = {
    state: "ok" | "seller_missing";
    orders: JsonRecord[];
    operations: JsonRecord[];
    definitions: PublicOrderMetadataDefinition[];
    total: number;
};

export const listMyOrders = (request: Request): Promise<Response> => listOrderReadModel(request, "buyer");
export const listMySales = (request: Request): Promise<Response> => listOrderReadModel(request, "seller");
export const listAdminOrders = (request: Request): Promise<Response> => listOrderReadModel(request, "admin");

async function listOrderReadModel(request: Request, scope: ListScope): Promise<Response> {
    const url = new URL(request.url);
    const limit = Math.min(Math.max(integer(url.searchParams.get("limit"), "limit") ?? 50, 1), 100);
    const offset = Math.max(integer(url.searchParams.get("offset"), "offset") ?? 0, 0);
    const actor = scope === "admin" ? null : cmsUserId(request);
    const status = text(url.searchParams.get("status")) ?? null;
    const sellerId = scope === "seller" ? null : (integer(url.searchParams.get("sellerId"), "sellerId") ?? null);
    const envelope = readEnvelope(
        await rpc("list_order_read_model", {
            p_scope: scope,
            p_cms_user_id: actor,
            p_status: status,
            p_seller_id: scope === "admin" ? sellerId : null,
            p_limit: limit,
            p_offset: offset,
        }),
        scope,
    );
    if (envelope.state === "seller_missing") {
        return json({ items: [], total: 0, limit, offset });
    }
    const operationByOrder = new Map(envelope.operations.map((operation) => [String(operation.order_id), operation]));
    const items =
        scope === "seller"
            ? envelope.orders.map((row) => projectSaleListItem(row, envelope.definitions))
            : envelope.orders.map((row) =>
                  projectOrderListItem(
                      row,
                      operationByOrder.get(String(row.id)) ?? null,
                      envelope.definitions,
                      scope === "buyer",
                  ),
              );
    return json({ items, total: envelope.total, limit, offset });
}

function readEnvelope(value: unknown, scope: ListScope): ListEnvelope {
    if (!isRecord(value)) {
        invalidEnvelope();
    }
    const orders = recordArray(value.orders);
    const operations = recordArray(value.operations);
    const definitions = recordArray(value.definitions);
    const total = value.total;
    if (!orders || !operations || !definitions || !Number.isSafeInteger(total) || (total as number) < 0) {
        invalidEnvelope();
    }
    if (value.state === "seller_missing") {
        if (scope !== "seller" || orders.length || operations.length || definitions.length || total !== 0) {
            invalidEnvelope();
        }
        return { state: "seller_missing", orders, operations, definitions: [], total: 0 };
    }
    if (
        value.state !== "ok" ||
        (scope === "seller" && operations.length) ||
        (scope === "admin" && definitions.length)
    ) {
        invalidEnvelope();
    }
    return {
        state: "ok",
        orders,
        operations,
        definitions: parsePublicOrderMetadataDefinitions(definitions),
        total: total as number,
    };
}

function recordArray(value: unknown): JsonRecord[] | null {
    return Array.isArray(value) && value.every(isRecord) ? value : null;
}

function invalidEnvelope(): never {
    throw new HttpError(502, "list_order_read_model returned an invalid response");
}
