import { HttpError } from "../../core/errors.ts";
import { json } from "../../core/http.ts";
import {
    enumValue,
    integer,
    nonNegativeInteger,
    queryInteger,
    readJsonObject,
    requiredText,
    text,
} from "../../core/records.ts";
import { rpc } from "../../core/rest.ts";
import { rpcEntity, rpcRecord } from "../../core/rpc-result.ts";
import { requirementByIds } from "./catalog-relationships.ts";

const itemStatuses = ["draft", "published", "archived"] as const;

export async function upsertCatalogItem(request: Request, kind: string): Promise<Response> {
    const body = await readJsonObject(request);
    const payload: Record<string, unknown> = {
        code: requiredText(body.code, "code"),
        name: requiredText(body.name, "name"),
        description: text(body.description) ?? null,
        status: enumValue(body.status, "status", itemStatuses) ?? "draft",
        sort_order: nonNegativeInteger(body.sortOrder, "sortOrder") ?? 0,
    };
    if (kind === "variant") {
        payload.module_item_id = integer(body.moduleItemId, "moduleItemId", true);
        payload.provider_name = text(body.providerName) ?? null;
        payload.pricing_mode = enumValue(body.pricingMode, "pricingMode", ["fixed", "quote"], true);
        payload.unit_amount_cents = money(body.unitAmountCents, "unitAmountCents");
        payload.currency = text(body.currency) ?? "EUR";
    }
    const result = await rpc(`upsert_catalog_${kind}`, {
        p_item_id: queryInteger(request, "id") ?? integer(body.id, "id") ?? null,
        p_payload: payload,
    });
    return json(rpcEntity(result, kind, `catalog ${kind}`));
}

export async function upsertVariantFeature(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const result = await rpc("upsert_variant_feature", {
        p_variant_item_id: integer(body.variantItemId, "variantItemId", true),
        p_feature_item_id: integer(body.featureItemId, "featureItemId", true),
        p_payload: {
            availability: enumValue(body.availability, "availability", ["included", "optional"], true),
            pricing_mode: enumValue(body.pricingMode, "pricingMode", ["included", "fixed", "quote"], true),
            unit_amount_cents: money(body.unitAmountCents, "unitAmountCents"),
            sort_order: nonNegativeInteger(body.sortOrder, "sortOrder") ?? 0,
        },
    });
    return json(rpcEntity(result, "variantFeature", "variant feature"));
}

export async function deleteVariantFeature(request: Request): Promise<Response> {
    const params = new URL(request.url).searchParams;
    const variantItemId = integer(params.get("variantItemId"), "variantItemId", true)!;
    const featureItemId = integer(params.get("featureItemId"), "featureItemId", true)!;
    const result = rpcRecord(
        await rpc("delete_variant_feature", {
            p_variant_item_id: variantItemId,
            p_feature_item_id: featureItemId,
        }),
        "variant feature",
    );
    return json({
        deleted: result.deleted === true,
        variantItemId,
        featureItemId,
    });
}

export async function upsertRequirement(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const result = await rpc("upsert_catalog_requirement", {
        p_subject_item_id: integer(body.subjectItemId, "subjectItemId", true),
        p_required_item_id: integer(body.requiredItemId, "requiredItemId", true),
    });
    rpcRecord(result, "catalog requirement");
    return json(
        await requirementByIds(
            integer(body.subjectItemId, "subjectItemId", true)!,
            integer(body.requiredItemId, "requiredItemId", true)!,
        ),
    );
}

export async function deleteRequirement(request: Request): Promise<Response> {
    const params = new URL(request.url).searchParams;
    const subjectItemId = integer(params.get("subjectItemId"), "subjectItemId", true)!;
    const requiredItemId = integer(params.get("requiredItemId"), "requiredItemId", true)!;
    const result = rpcRecord(
        await rpc("delete_catalog_requirement", {
            p_subject_item_id: subjectItemId,
            p_required_item_id: requiredItemId,
        }),
        "catalog requirement",
    );
    return json({
        deleted: result.deleted === true,
        subjectItemId,
        requiredItemId,
    });
}

function money(value: unknown, name: string): number | null {
    if (value === undefined || value === null || value === "") {
        return null;
    }
    const result = typeof value === "number" ? value : Number(value);
    if (!Number.isSafeInteger(result) || result < 0) {
        throw new HttpError(400, `${name} must be a non-negative integer`);
    }
    return result;
}
