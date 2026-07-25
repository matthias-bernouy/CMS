import type { JsonRecord } from "../core/types.ts";

interface CatalogRows {
    items: JsonRecord[];
    modules: JsonRecord[];
    variants: JsonRecord[];
    features: JsonRecord[];
    variantFeatures: JsonRecord[];
    requirements: JsonRecord[];
}

export function partnerCatalogProjection(rows: CatalogRows): JsonRecord {
    const items = new Map(rows.items.map((item) => [Number(item.id), item]));
    const moduleIds = new Set(rows.modules.map((module) => Number(module.item_id)));
    const featureIds = new Set(rows.features.map((feature) => Number(feature.item_id)));
    const variants = rows.variants
        .filter((variant) => items.get(Number(variant.item_id))?.status === "published")
        .sort(
            (left, right) =>
                Number(items.get(Number(left.item_id))?.sort_order ?? 0) -
                Number(items.get(Number(right.item_id))?.sort_order ?? 0),
        );

    return {
        modules: rows.items
            .filter((item) => item.kind === "module" && item.status === "published" && moduleIds.has(Number(item.id)))
            .map((module) => ({
                ...itemSummary(module),
                requirements: requirementsFor(module.id, rows, items),
                variants: variants
                    .filter((variant) => Number(variant.module_item_id) === Number(module.id))
                    .map((variant) => variantProjection(variant, rows, items, featureIds)),
            })),
    };
}

function variantProjection(
    variant: JsonRecord,
    rows: CatalogRows,
    items: Map<number, JsonRecord>,
    featureIds: Set<number>,
): JsonRecord {
    const item = items.get(Number(variant.item_id)) ?? {};
    const relationships = rows.variantFeatures.filter(
        (relationship) => Number(relationship.variant_item_id) === Number(variant.item_id),
    );
    return {
        ...itemSummary(item),
        provider_name: variant.provider_name,
        pricing_mode: variant.pricing_mode,
        unit_amount_cents: variant.unit_amount_cents,
        currency: variant.currency,
        features: relationships.flatMap((relationship) => {
            const featureId = Number(relationship.feature_item_id);
            const feature = items.get(featureId);
            if (!feature || feature.status !== "published" || !featureIds.has(featureId)) {
                return [];
            }
            return [
                {
                    ...itemSummary(feature),
                    availability: relationship.availability,
                    pricing_mode: relationship.pricing_mode,
                    unit_amount_cents: relationship.unit_amount_cents,
                    currency: variant.currency,
                    requirements: requirementsFor(featureId, rows, items),
                },
            ];
        }),
        requirements: requirementsFor(variant.item_id, rows, items),
    };
}

function requirementsFor(subjectId: unknown, rows: CatalogRows, items: Map<number, JsonRecord>): JsonRecord[] {
    return rows.requirements
        .filter((requirement) => Number(requirement.subject_item_id) === Number(subjectId))
        .map((requirement) => catalogRequirementProjection(requirement, items));
}

export function catalogRequirementProjection(requirement: JsonRecord, items: Map<number, JsonRecord>): JsonRecord {
    const subject = items.get(Number(requirement.subject_item_id)) ?? {};
    const required = items.get(Number(requirement.required_item_id)) ?? {};
    return {
        subject_item_id: requirement.subject_item_id,
        subject_kind: subject.kind,
        subject_code: subject.code,
        subject_name: subject.name,
        required_item_id: requirement.required_item_id,
        required_kind: required.kind,
        required_code: required.code,
        required_name: required.name,
        created_at: requirement.created_at,
    };
}

function itemSummary(item: JsonRecord): JsonRecord {
    return {
        id: item.id,
        code: item.code,
        name: item.name,
        description: item.description,
    };
}
