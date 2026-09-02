import { HttpError } from "../../core/errors.ts";
import { json } from "../../core/http.ts";
import { addSearch, listQuery } from "../../services/query.ts";
import { camelize, integer } from "../../core/records.ts";
import { listRows, one, restJson } from "../../core/rest.ts";
import type { JsonRecord } from "../../core/types.ts";

const itemSelect = "id,kind,code,name,description,status,sort_order,created_at,updated_at";

export async function listCatalogItems(request: Request): Promise<Response> {
    const query = listQuery(request);
    const params = new URLSearchParams({
        select: itemSelect,
        order: "kind.asc,sort_order.asc,id.asc",
        limit: String(query.limit),
        offset: String(query.offset),
    });
    if (query.status) {
        params.set("status", `eq.${query.status}`);
    }
    addSearch(params, query.query, "name", "code", "description");
    const { rows, total } = await listRows(`catalog_items?${params}`);
    return json({
        items: camelize(rows.map(catalogLookupItem)),
        total,
        limit: query.limit,
        offset: query.offset,
    });
}

export async function listCatalogKind(request: Request, kind: string): Promise<Response> {
    const query = listQuery(request);
    const params = new URLSearchParams({
        select: itemSelect,
        kind: `eq.${kind}`,
        order: "sort_order.asc,id.asc",
        limit: String(query.limit),
        offset: String(query.offset),
    });
    if (query.status) {
        params.set("status", `eq.${query.status}`);
    }
    if (kind === "variant") {
        const moduleId = integer(new URL(request.url).searchParams.get("moduleItemId"), "moduleItemId");
        if (moduleId) {
            const variants = await restJson<JsonRecord[]>(
                `catalog_variants?select=item_id&module_item_id=eq.${moduleId}`,
            );
            if (!variants.length) {
                return json({ items: [], total: 0, limit: query.limit, offset: query.offset });
            }
            params.set("id", `in.(${variants.map((row) => row.item_id).join(",")})`);
        }
    }
    addSearch(params, query.query, "name", "code", "description");
    const { rows, total } = await listRows(`catalog_items?${params}`);
    const items = kind === "variant" ? await hydrateVariants(rows) : rows;
    return json({ items: camelize(items), total, limit: query.limit, offset: query.offset });
}

export async function getCatalogKind(request: Request, kind: string): Promise<Response> {
    const idValue = new URL(request.url).searchParams.get("id");
    if (idValue === "__new__") {
        return json(newCatalogKind(kind));
    }
    const id = integer(idValue, "id", true)!;
    const item = await one("catalog_items", { id, kind }, itemSelect);
    if (!item) {
        throw new HttpError(404, `${kind} not found`);
    }
    const details = await one(subtypeTable(kind), { item_id: id });
    if (!details) {
        throw new HttpError(404, `${kind} not found`);
    }
    if (kind !== "variant") {
        return json(camelize({ ...item, ...details }));
    }
    const module = await one("catalog_items", { id: Number(details.module_item_id), kind: "module" }, "id,name");
    return json(camelize({ ...item, ...details, module_name: module?.name }));
}

function catalogLookupItem(item: JsonRecord): JsonRecord {
    return {
        ...item,
        lookup_subtitle: `${String(item.kind)} · ${String(item.code)}`,
    };
}

function newCatalogKind(kind: string): JsonRecord {
    const item = {
        id: null,
        code: "",
        name: "",
        description: null,
        status: "draft",
        sortOrder: 0,
    };
    if (kind === "module" || kind === "feature") {
        return item;
    }
    if (kind === "variant") {
        return {
            ...item,
            moduleItemId: null,
            moduleName: "",
            providerName: null,
            pricingMode: "fixed",
            unitAmountCents: null,
            currency: "EUR",
        };
    }
    throw new HttpError(500, "unsupported catalogue kind");
}

async function hydrateVariants(rows: JsonRecord[]): Promise<JsonRecord[]> {
    if (!rows.length) {
        return [];
    }
    const ids = rows.map((row) => Number(row.id));
    const details = await restJson<JsonRecord[]>(`catalog_variants?select=*&item_id=in.(${ids.join(",")})`);
    const byId = new Map(details.map((detail) => [Number(detail.item_id), detail]));
    const modules = await catalogItemsFor(details, "module_item_id");
    return rows.map((row) => {
        const detail = byId.get(Number(row.id)) ?? {};
        return {
            ...row,
            ...detail,
            module_name: modules.get(Number(detail.module_item_id))?.name,
        };
    });
}

async function catalogItemsFor(rows: JsonRecord[], ...fields: string[]): Promise<Map<number, JsonRecord>> {
    const ids = [
        ...new Set(rows.flatMap((row) => fields.map((field) => Number(row[field]))).filter(Number.isSafeInteger)),
    ];
    if (!ids.length) {
        return new Map();
    }
    const items = await restJson<JsonRecord[]>(`catalog_items?select=id,kind,code,name&id=in.(${ids.join(",")})`);
    return new Map(items.map((item) => [Number(item.id), item]));
}

function subtypeTable(kind: string): string {
    if (!["module", "variant", "feature"].includes(kind)) {
        throw new HttpError(500, "unsupported catalogue kind");
    }
    return `catalog_${kind}s`;
}
