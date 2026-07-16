import { HttpError } from "../../core/errors.ts";
import { json } from "../../core/http.ts";
import { camelize, integer, isRecord, publicMetadata, readJsonObject, text } from "../../core/records.ts";
import { listRows, one, restJson, rpc } from "../../core/rest.ts";
import type { JsonRecord } from "../../core/types.ts";
import { productData } from "./product-data.ts";
import { withVariantMatrix } from "./variant-matrix.ts";

const productSelect = "id,slug,title,description,brand_id,status,visibility,metadata,version,created_at,updated_at";

export async function listProducts(request: Request, admin: boolean): Promise<Response> {
    const url = new URL(request.url);
    const params = paging(url);
    params.set("select", productSelect);
    params.set("order", "updated_at.desc,id.desc");
    if (!admin) {
        params.set("status", "eq.active");
        params.set("visibility", "eq.public");
    } else {
        addEq(params, "status", url.searchParams.get("status"));
        addEq(params, "visibility", url.searchParams.get("visibility"));
    }
    addSearch(params, url.searchParams.get("q"), ["title", "slug"]);
    const { rows, total } = await listRows(`products?${params.toString()}`);
    const items = admin ? rows : await redactMetadata(rows, "product");
    return json({ items: camelize(items), total, limit: Number(params.get("limit")), offset: Number(params.get("offset")) });
}

export async function getProduct(request: Request, admin: boolean): Promise<Response> {
    const url = new URL(request.url);
    if (admin && url.searchParams.get("id") === "__new__") return json(newProduct());
    const row = await rowByIdOrSlug(url);
    if (!row || (!admin && (row.status !== "active" || row.visibility !== "public"))) {
        throw new HttpError(404, "product not found");
    }
    const visible = admin ? row : (await redactMetadata([row], "product"))[0]!;
    return json(await productData(request, visible));
}

export async function upsertProduct(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const body = withVariantMatrix(await readJsonObject(request));
    const productId = optionalId(url.searchParams.get("id"));
    const result = await rpc("upsert_product", {
        p_product_id: productId,
        p_payload: body,
        p_expected_version: integer(body.expectedVersion, "expectedVersion", productId !== null),
    });
    if (!isRecord(result)) throw new HttpError(502, "upsert_product returned an invalid response");
    return json(await productData(request, result));
}

async function rowByIdOrSlug(url: URL): Promise<JsonRecord | null> {
    const id = optionalId(url.searchParams.get("id"));
    const slug = text(url.searchParams.get("slug"));
    if (id === null && !slug) throw new HttpError(400, "id or slug is required");
    return id !== null
        ? await one("products", { id }, productSelect)
        : await one("products", { slug: slug! }, productSelect);
}

async function redactMetadata(rows: JsonRecord[], entityType: string): Promise<JsonRecord[]> {
    const definitions = await restJson<JsonRecord[]>(
        `custom_field_definitions?select=key&entity_type=eq.${entityType}&public_readable=eq.true&enabled=eq.true`,
    );
    const allowed = new Set(definitions.map(row => String(row.key)));
    return rows.map(row => ({ ...row, metadata: publicMetadata(row.metadata, allowed) }));
}

function newProduct(): JsonRecord {
    return {
        id: null, slug: "", title: "", description: "", brandId: null, primaryCategoryId: null,
        status: "draft", visibility: "public",
        metadata: {}, media: [], mainImageMediaId: null, variantAxes: [], variants: [], variantMatrix: [], version: 1,
    };
}

function paging(url: URL): URLSearchParams {
    const limit = Math.min(Math.max(integer(url.searchParams.get("limit"), "limit") ?? 50, 1), 100);
    const offset = Math.max(integer(url.searchParams.get("offset"), "offset") ?? 0, 0);
    return new URLSearchParams({ limit: String(limit), offset: String(offset) });
}

function addEq(params: URLSearchParams, column: string, value: string | null): void {
    if (value?.trim()) params.set(column, `eq.${value.trim()}`);
}

function addSearch(params: URLSearchParams, value: string | null, columns: string[]): void {
    const query = value?.trim().replace(/[,*()]/g, " ");
    if (query) params.set("or", `(${columns.map(column => `${column}.ilike.*${query}*`).join(",")})`);
}

function optionalId(value: string | null): number | null {
    if (!value || value === "__new__") return null;
    return integer(value, "id", true)!;
}
