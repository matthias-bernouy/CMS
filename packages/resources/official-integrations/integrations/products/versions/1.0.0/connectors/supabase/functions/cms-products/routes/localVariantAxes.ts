import { getOne, restJson } from "../core/rest.ts";
import type { JsonRecord } from "../core/types.ts";
import { insertRow, updateRow } from "../writes/rows.ts";

export type LocalVariantAxis = {
    key: string;
    label: string;
    values: string[];
    position: number;
};

export type LocalVariantChoice = {
    axisKey: string;
    axisLabel: string;
    valueKey: string;
    value: string;
};

export function localVariantAxesFromProduct(product: JsonRecord): LocalVariantAxis[] {
    return normalizeVariantAxes(record(product.metadata).variantAxes);
}

export function normalizeVariantAxes(value: unknown): LocalVariantAxis[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry, index) => {
        const row = record(entry);
        const label = text(row.label);
        if (!label) return [];
        const values = list(row.values);
        if (!values.length) return [];
        return [{
            key: text(row.key) || slug(label) || `axis-${index + 1}`,
            label,
            values,
            position: number(row.position, index),
        }];
    }).sort((a, b) => a.position - b.position);
}

export function variantOptionGroupsFromAxes(axes: LocalVariantAxis[]): JsonRecord[] {
    return axes.map(axis => ({
        key: axis.key,
        label: axis.label,
        position: axis.position,
        options: axis.values.map((value, index) => ({
            id: `${axis.key}:${slug(value) || index + 1}`,
            value,
            label: value,
            position: index,
        })),
        optionsSummary: axis.values.join(", "),
    }));
}

export function variantOptionsSummaryFromAxes(axes: LocalVariantAxis[]): string {
    return axes.map(axis => `${axis.label}: ${axis.values.join(", ")}`).join(" | ");
}

export function variantMatrixRows(axes: LocalVariantAxis[], variants: JsonRecord[]): JsonRecord[] {
    const existing = new Map<string, JsonRecord>();
    for (const variant of variants) {
        const key = text(record(variant.metadata).optionKey);
        if (key) existing.set(key, variant);
    }
    return combinations(axes).map((choices, index) => {
        const key = combinationKey(choices);
        const variant = existing.get(key);
        return {
            key,
            options: choices.map(choice => choice.value).join(" / "),
            title: variant?.title ?? variantTitle(choices),
            sku: variant?.sku ?? "",
            status: variant?.status ?? "inactive",
            variantId: variant?.id == null ? "" : String(variant.id),
            position: index,
        };
    });
}

export async function syncProductLocalVariantAxes(productId: string | number, body: JsonRecord): Promise<void> {
    if (!("variantAxes" in body) && !("variant_axes" in body)) return;
    const axes = normalizeVariantAxes(body.variantAxes ?? body.variant_axes);
    await writeProductAxes(productId, axes);
    await syncProductVariants(productId, axes);
}

export async function syncProductVariants(productId: string | number, axes: LocalVariantAxis[]): Promise<JsonRecord> {
    if (!axes.length) return { ok: true, total: 0, created: 0, existing: 0, items: [] };
    const choices = combinations(axes);
    const existing = await existingGeneratedVariants(productId);
    const created: JsonRecord[] = [];

    for (const combination of choices) {
        const key = combinationKey(combination);
        if (existing.has(key)) continue;
        const variant = await insertRow("product_variants", {
            product_id: productId,
            title: variantTitle(combination),
            status: "inactive",
            position: existing.size + created.length,
            metadata: {
                generatedFromAxes: true,
                optionKey: key,
                optionValues: combination,
            },
        });
        created.push(variant);
        existing.set(key, variant);
    }

    return { ok: true, total: choices.length, created: created.length, existing: choices.length - created.length, items: created };
}

export function combinations(axes: LocalVariantAxis[]): LocalVariantChoice[][] {
    if (!axes.length) return [];
    const groups = axes.map(axis => axis.values.map(value => ({
        axisKey: axis.key,
        axisLabel: axis.label,
        valueKey: slug(value) || value,
        value,
    })));
    return groups.reduce<LocalVariantChoice[][]>((sets, group) => sets.flatMap(set => group.map(choice => [...set, choice])), [[]]);
}

export function combinationKey(choices: LocalVariantChoice[]): string {
    return choices.map(choice => `${choice.axisKey}:${choice.valueKey}`).join("|");
}

export function variantTitle(choices: LocalVariantChoice[]): string {
    return choices.map(choice => `${choice.axisLabel}: ${choice.value}`).join(" / ");
}

async function writeProductAxes(productId: string | number, axes: LocalVariantAxis[]): Promise<void> {
    const product = await getOne("products", { id: productId }, "id,metadata");
    const metadata = { ...record(product?.metadata), variantAxes: axes };
    await updateRow("products", productId, { metadata });
}

async function existingGeneratedVariants(productId: string | number): Promise<Map<string, JsonRecord>> {
    const rows = await restJson<JsonRecord[]>(
        `product_variants?product_id=eq.${encodeURIComponent(String(productId))}&select=id,sku,title,status,position,metadata`,
        { method: "GET" },
    );
    const out = new Map<string, JsonRecord>();
    for (const row of rows) {
        const key = text(record(row.metadata).optionKey);
        if (key) out.set(key, row);
    }
    return out;
}

function record(value: unknown): JsonRecord {
    return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function text(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function list(value: unknown): string[] {
    if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean);
    if (typeof value === "string") return value.split(",").map(item => item.trim()).filter(Boolean);
    return [];
}

function number(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function slug(value: string): string {
    return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
