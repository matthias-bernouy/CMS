import { json } from "../../core/http.ts";
import { requirePartner } from "../../services/partner.ts";
import { camelize } from "../../core/records.ts";
import { restJson } from "../../core/rest.ts";
import type { JsonRecord } from "../../core/types.ts";
import { partnerCatalogProjection } from "../../services/catalog.ts";

export async function getPartnerCatalog(request: Request): Promise<Response> {
    await requirePartner(request);
    const [items, modules, variants, features, variantFeatures, requirements] = await Promise.all([
        restJson<JsonRecord[]>(
            "catalog_items?select=id,kind,code,name,description,status,sort_order&status=eq.published&order=sort_order.asc,id.asc",
        ),
        restJson<JsonRecord[]>("catalog_modules?select=item_id"),
        restJson<JsonRecord[]>(
            "catalog_variants?select=item_id,module_item_id,provider_name,pricing_mode,unit_amount_cents,currency",
        ),
        restJson<JsonRecord[]>("catalog_features?select=item_id"),
        restJson<JsonRecord[]>(
            "variant_features?select=variant_item_id,feature_item_id,availability,pricing_mode,unit_amount_cents,sort_order&order=sort_order.asc",
        ),
        restJson<JsonRecord[]>(
            "catalog_requirements?select=subject_item_id,required_item_id,created_at&order=subject_item_id.asc,required_item_id.asc",
        ),
    ]);
    return json(
        camelize(
            partnerCatalogProjection({
                items,
                modules,
                variants,
                features,
                variantFeatures,
                requirements,
            }),
        ),
    );
}
