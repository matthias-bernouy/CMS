import { cmsUserId } from "../core/auth.ts";
import { HttpError } from "../core/errors.ts";
import { integer, isRecord, publicMetadata } from "../core/records.ts";
import { one, restJson } from "../core/rest.ts";
import type { JsonRecord } from "../core/types.ts";
import { offerMediaData } from "./offer/media.ts";

export async function requireOwnedOffer(request: Request, offer: JsonRecord): Promise<void> {
    const seller = await one("sellers", { id: String(offer.seller_id) }, "cms_user_id");
    if (!seller || seller.cms_user_id !== cmsUserId(request)) throw new HttpError(404, "offer not found");
}

export async function enrichOffer(
    offer: JsonRecord,
    scope: "public" | "admin" | "self",
): Promise<JsonRecord> {
    const [seller, product, variant, priceRule, proposals, media] = await Promise.all([
        scope === "public"
            ? null
            : one("sellers", { id: String(offer.seller_id) }, "id,kind,slug,display_name,verification_status"),
        one("products", { id: String(offer.product_id) }, "id,slug,title,brand_id,status,visibility,metadata"),
        offer.variant_id ? one("product_variants", { id: String(offer.variant_id) }, "id,sku,title,status") : null,
        scope === "admin"
            ? one("offer_price_rules", { offer_id: String(offer.id) })
            : scope === "self"
                ? one("offer_price_rules", { offer_id: String(offer.id) }, "offer_id,minimum_amount,maximum_amount,currency,version,created_at,updated_at")
                : null,
        scope === "admin" || scope === "self"
            ? restJson<JsonRecord[]>(`offer_price_proposals?select=${scope === "admin" ? "*" : "id,offer_id,amount,currency,status,decision_reason,decided_at,created_at"}&offer_id=eq.${String(offer.id)}&order=created_at.desc&limit=20`)
            : [],
        offerMediaData(String(offer.id)),
    ]);
    const classifiedProduct = await classifyProduct(product);
    const visibleProduct = scope === "admin" ? classifiedProduct : await redactEntityMetadata(classifiedProduct, "product");
    const visibleOffer = scope === "public"
        ? Object.fromEntries(Object.entries(offer).filter(([key]) => key !== "seller_id"))
        : offer;
    return {
        ...visibleOffer,
        ...(scope === "public" ? {} : { seller }),
        product: visibleProduct, variant,
        price_rule: priceRule, price_proposals: proposals, ...media,
    };
}

async function classifyProduct(product: JsonRecord | null): Promise<JsonRecord | null> {
    if (!product) return null;
    const [brand, categoryRows] = await Promise.all([
        product.brand_id
            ? one("brands", { id: String(product.brand_id) }, "id,slug,name,status")
            : null,
        restJson<JsonRecord[]>(
            `product_categories?select=category_id,is_primary,position,category:categories(id,parent_id,slug,full_slug,label,status,position)&product_id=eq.${String(product.id)}&order=is_primary.desc,position.asc`,
        ),
    ]);
    const primary = categoryRows.find(row => row.is_primary === true);
    return {
        ...product,
        brand,
        primary_category_id: primary?.category_id ?? null,
        primary_category: isRecord(primary?.category) ? primary.category : null,
    };
}

export async function redactOfferMetadata(rows: JsonRecord[]): Promise<JsonRecord[]> {
    const allowed = await publicMetadataKeys("offer");
    return rows.map(row => ({ ...row, metadata: publicMetadata(row.metadata, allowed) }));
}

async function redactEntityMetadata(row: JsonRecord | null, entityType: string): Promise<JsonRecord | null> {
    if (!row) return null;
    const metadata = isRecord(row.metadata) ? row.metadata : {};
    return { ...row, metadata: publicMetadata(metadata, await publicMetadataKeys(entityType)) };
}

async function publicMetadataKeys(entityType: string): Promise<Set<string>> {
    const definitions = await restJson<JsonRecord[]>(
        `custom_field_definitions?select=key&entity_type=eq.${entityType}&public_readable=eq.true&enabled=eq.true`,
    );
    return new Set(definitions.map(row => String(row.key)));
}

export function addFilter(
    params: URLSearchParams,
    column: string,
    value: string | null,
    allowed: boolean,
): void {
    if (allowed && value?.trim()) params.set(column, `eq.${value.trim()}`);
}

export function optionalId(value: string | null): number | null {
    if (!value || value === "__new__") return null;
    return integer(value, "id", true)!;
}

export function sellerOfferPayload(body: JsonRecord): JsonRecord {
    const allowed = [
        "slug",
        "title",
        "description",
        "productId",
        "variantId",
        "conditionCode",
        "currency",
        "publicationStatus",
        "availability",
        "quantityAvailable",
        "metadata",
    ];
    return Object.fromEntries(allowed.filter(key => body[key] !== undefined).map(key => [key, body[key]]));
}
