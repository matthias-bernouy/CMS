import { requireCmsRequest, requireCmsWriteRequest } from "../core/auth.ts";
import { HttpError } from "../core/errors.ts";
import { json, withMethod } from "../core/http.ts";
import { listQuery, listResponse, queryText, requiredPositiveInteger } from "../core/query.ts";
import { camelizeRecord } from "../core/records.ts";
import { restJson } from "../core/rest.ts";
import type { JsonRecord } from "../core/types.ts";
import { insertRow } from "../writes/rows.ts";

const axisSelect = "id,product_id,attribute_id,position,attributes(id,code,name,data_type)";
const axisOptionSelect = [
    "id",
    "product_id",
    "attribute_id",
    "option_id",
    "position",
    "attributes(id,code,name,data_type)",
    "attribute_options(id,attribute_id,value,label,position)",
].join(",");

type Choice = {
    attributeId: string;
    attributeLabel: string;
    optionId: string;
    optionLabel: string;
};

export async function productVariantAxes(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const url = new URL(request.url);
    const productId = requiredPositiveInteger(url.searchParams.get("productId"), "productId");
    const query = listQuery(axisSelect, url, "position.asc");
    query.set("product_id", `eq.${productId}`);
    const rows = await restJson<JsonRecord[]>(`product_variant_axes?${query.toString()}`, { method: "GET" });
    const options = await restJson<JsonRecord[]>(
        `product_variant_axis_options?product_id=eq.${productId}&select=${encodeURIComponent(axisOptionSelect)}&order=position.asc`,
        { method: "GET" },
    );
    return json(listResponse(rows.map(row => withOptionsSummary(row, options)), url));
}

export async function productVariantAxisOptions(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const url = new URL(request.url);
    const query = listQuery(axisOptionSelect, url, "position.asc");
    query.set("product_id", `eq.${requiredPositiveInteger(url.searchParams.get("productId"), "productId")}`);
    const attributeId = queryText(url, "attributeId");
    if (attributeId) query.set("attribute_id", `eq.${attributeId}`);
    const rows = await restJson<JsonRecord[]>(`product_variant_axis_options?${query.toString()}`, { method: "GET" });
    return json(listResponse(rows, url));
}

export async function generateProductVariants(request: Request): Promise<Response> {
    requireCmsWriteRequest(request);
    return await withMethod(request, "POST", async () => {
        const productId = requiredPositiveInteger(new URL(request.url).searchParams.get("productId"), "productId");
        const groups = await variantGroups(productId);
        const combinations = cartesian(groups);
        const existing = await existingCombinationKeys(productId, groups.map(group => group[0]!.attributeId));
        const created: JsonRecord[] = [];

        for (const combination of combinations) {
            const key = combinationKey(combination);
            if (existing.has(key)) continue;
            const variant = await insertRow("product_variants", {
                product_id: productId,
                title: combination.map(choice => `${choice.attributeLabel}: ${choice.optionLabel}`).join(" / "),
                status: "inactive",
                position: existing.size + created.length,
                metadata: { generatedFromAxes: true, optionKey: key },
            });
            for (const choice of combination) {
                await insertRow("variant_attribute_values", {
                    variant_id: variant.id,
                    attribute_id: choice.attributeId,
                    option_id: choice.optionId,
                });
            }
            created.push(camelizeRecord(variant));
            existing.add(key);
        }

        return json({ ok: true, total: combinations.length, created: created.length, existing: combinations.length - created.length, items: created });
    });
}

async function variantGroups(productId: number): Promise<Choice[][]> {
    const axes = await restJson<JsonRecord[]>(
        `product_variant_axes?product_id=eq.${productId}&select=${encodeURIComponent(axisSelect)}&order=position.asc`,
        { method: "GET" },
    );
    if (!axes.length) throw new HttpError(400, "product has no variant axes");
    const options = await restJson<JsonRecord[]>(
        `product_variant_axis_options?product_id=eq.${productId}&select=${encodeURIComponent(axisOptionSelect)}&order=position.asc`,
        { method: "GET" },
    );
    return axes.map(axis => {
        const attributeId = String(axis.attribute_id);
        const attribute = record(axis.attributes);
        const choices = options.filter(option => String(option.attribute_id) === attributeId).flatMap(option => {
            const optionRow = record(option.attribute_options);
            if (String(optionRow.attribute_id) !== attributeId) return [];
            return [{
                attributeId,
                attributeLabel: label(attribute, "name", "code", attributeId),
                optionId: String(option.option_id),
                optionLabel: label(optionRow, "label", "value", String(option.option_id)),
            }];
        });
        if (!choices.length) throw new HttpError(400, `variant axis ${attributeId} has no options`);
        return choices;
    });
}

async function existingCombinationKeys(productId: number, attributeIds: string[]): Promise<Set<string>> {
    const variants = await restJson<JsonRecord[]>(`product_variants?product_id=eq.${productId}&select=id`, { method: "GET" });
    const ids = variants.map(row => row.id).filter(value => value !== undefined && value !== null).map(String);
    if (!ids.length) return new Set();
    const values = await restJson<JsonRecord[]>(
        `variant_attribute_values?variant_id=in.(${ids.join(",")})&select=variant_id,attribute_id,option_id`,
        { method: "GET" },
    );
    const byVariant = new Map<string, Choice[]>();
    for (const value of values) {
        const attributeId = String(value.attribute_id);
        if (!attributeIds.includes(attributeId)) continue;
        const list = byVariant.get(String(value.variant_id)) ?? [];
        list.push({ attributeId, attributeLabel: attributeId, optionId: String(value.option_id), optionLabel: String(value.option_id) });
        byVariant.set(String(value.variant_id), list);
    }
    return new Set(Array.from(byVariant.values())
        .filter(choices => choices.length === attributeIds.length)
        .map(combinationKey));
}

function cartesian(groups: Choice[][]): Choice[][] {
    return groups.reduce<Choice[][]>((sets, group) => sets.flatMap(set => group.map(choice => [...set, choice])), [[]]);
}

function combinationKey(choices: Choice[]): string {
    return choices.map(choice => `${choice.attributeId}:${choice.optionId}`).join("|");
}

function record(value: unknown): JsonRecord {
    return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function label(row: JsonRecord, preferred: string, fallback: string, empty: string): string {
    return String(row[preferred] || row[fallback] || empty);
}

function withOptionsSummary(axis: JsonRecord, options: JsonRecord[]): JsonRecord {
    const attributeId = String(axis.attribute_id);
    const labels = options
        .filter(option => String(option.attribute_id) === attributeId)
        .map(option => label(record(option.attribute_options), "label", "value", String(option.option_id)))
        .filter(Boolean);
    return {
        ...axis,
        option_count: labels.length,
        options_summary: labels.join(", "),
    };
}
