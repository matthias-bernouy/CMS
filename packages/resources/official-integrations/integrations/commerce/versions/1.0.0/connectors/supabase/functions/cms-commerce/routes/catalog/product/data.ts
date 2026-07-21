import { camelize, isRecord, publicMetadata } from "../../../core/records.ts";
import type { JsonRecord } from "../../../core/types.ts";

export type ProductReadBundle = {
    product: JsonRecord;
    publicMetadataKeys: string[];
    axes: JsonRecord[];
    values: JsonRecord[];
    variants: JsonRecord[];
    selections: JsonRecord[];
    media: JsonRecord[];
    brand: JsonRecord | null;
    categories: JsonRecord[];
};

export function productData(bundle: ProductReadBundle, publicScope: boolean): JsonRecord {
    const product = publicScope
        ? {
              ...bundle.product,
              metadata: publicMetadata(bundle.product.metadata, new Set(bundle.publicMetadataKeys)),
          }
        : bundle.product;
    const currentVariants = matrixRows(
        bundle.axes,
        bundle.values,
        bundle.variants,
        bundle.selections,
        isRecord(product.metadata) ? product.metadata : {},
    );
    const mediaRows = bundle.media.map(mediaRow);
    const primaryCategory = bundle.categories.find((category) => category.is_primary === true) ?? null;
    return {
        ...(camelize(product) as JsonRecord),
        brand: bundle.brand ? camelize(bundle.brand) : null,
        primaryCategoryId: primaryCategory?.category_id ?? null,
        primaryCategory:
            primaryCategory && isRecord(primaryCategory.category) ? camelize(primaryCategory.category) : null,
        categories: bundle.categories.map((category) => camelize(category)),
        media: mediaRows,
        mainImageMediaId: mainMediaId(mediaRows),
        variantAxes: axisRows(bundle.axes, bundle.values),
        variants: currentVariants,
        variantMatrix: currentVariants,
    };
}

function axisRows(axes: JsonRecord[], values: JsonRecord[]): JsonRecord[] {
    return axes.map((axis) => ({
        key: axis.key,
        fieldKey: axis.field_key,
        label: axis.label,
        position: axis.position,
        values: values.filter((value) => same(value.axis_id, axis.id)).map((value) => value.label),
    }));
}

function matrixRows(
    axes: JsonRecord[],
    values: JsonRecord[],
    variants: JsonRecord[],
    selections: JsonRecord[],
    productMetadata: JsonRecord,
): JsonRecord[] {
    const axisById = new Map(axes.map((axis) => [String(axis.id), axis]));
    const valueById = new Map(values.map((value) => [String(value.id), value]));
    return variants.flatMap((variant) => {
        const choices = selections
            .filter((row) => same(row.variant_id, variant.id))
            .map((row) => {
                const axis = axisById.get(String(row.axis_id));
                const value = valueById.get(String(row.value_id));
                return axis && value
                    ? {
                          axisKey: axis.key,
                          axisLabel: axis.label,
                          valueKey: value.key,
                          valueLabel: value.label,
                          fieldKey: axis.field_key,
                          value: value.value,
                          position: axis.position,
                      }
                    : null;
            })
            .filter(isRecord)
            .sort((left, right) => Number(left.position) - Number(right.position));
        if (!variant.combination_key || choices.length !== axes.length) {
            return [];
        }
        return [
            {
                ...(camelize(variant) as JsonRecord),
                key: variant.combination_key,
                variantId: String(variant.id),
                options: choices.map((choice) => choice.valueLabel).join(" / "),
                choices: choices.map(({ position: _position, ...choice }) => choice),
                effectiveMetadata: {
                    ...productMetadata,
                    ...(isRecord(variant.metadata) ? variant.metadata : {}),
                    ...Object.fromEntries(
                        choices
                            .filter((choice) => choice.fieldKey)
                            .map((choice) => [String(choice.fieldKey), choice.value]),
                    ),
                },
            },
        ];
    });
}

function mediaRow(row: JsonRecord): JsonRecord {
    const media = isRecord(row.media) ? row.media : {};
    return camelize({ ...row, media: { ...media, url: "" } }) as JsonRecord;
}

function mainMediaId(rows: JsonRecord[]): string | null {
    const row = rows.find((item) => item.isMain) ?? rows[0];
    return row && isRecord(row.media) ? String(row.media.id ?? "") || null : null;
}

function same(left: unknown, right: unknown): boolean {
    return String(left) === String(right);
}
