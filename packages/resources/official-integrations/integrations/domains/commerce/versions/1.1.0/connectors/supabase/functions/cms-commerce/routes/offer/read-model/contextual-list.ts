import { HttpError } from "../../../core/errors.ts";
import { json } from "../../../core/http.ts";
import { camelize, integer, isRecord, text } from "../../../core/records.ts";
import { rpc } from "../../../core/rest.ts";
import type { JsonRecord } from "../../../core/types.ts";

export function hasContextualFilters(url: URL): boolean {
    return ["category", "brand", "filters"].some((name) => url.searchParams.has(name));
}

export async function listContextualOffers(url: URL): Promise<Response> {
    const limit = Math.min(Math.max(integer(url.searchParams.get("limit"), "limit") ?? 50, 1), 100);
    const offset = Math.max(integer(url.searchParams.get("offset"), "offset") ?? 0, 0);
    const result = await rpc("search_public_offers_read_model", {
        p_category_full_slug: text(url.searchParams.get("category")),
        p_brand_slug: text(url.searchParams.get("brand")),
        p_filters: parseFilters(url.searchParams.get("filters")),
        p_query: text(url.searchParams.get("q")),
        p_condition_code: text(url.searchParams.get("conditionCode")),
        p_price_min: amount(url.searchParams.get("priceMin")),
        p_price_max: amount(url.searchParams.get("priceMax")),
        p_sort: text(url.searchParams.get("sort")),
        p_limit: limit,
        p_offset: offset,
    });
    if (!isRecord(result) || !Array.isArray(result.items) || typeof result.whole_unit_prices !== "boolean") {
        throw new HttpError(502, "search_public_offers returned an invalid response");
    }
    const rows = result.items.filter(isRecord);
    return json({
        items: camelize(rows),
        wholeUnitPrices: result.whole_unit_prices,
        total: Number(result.total) || 0,
        limit,
        offset,
    });
}

function parseFilters(raw: string | null): JsonRecord {
    if (!raw) {
        return {};
    }
    if (raw.length > 16384) {
        throw new HttpError(400, "filters are too large");
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new HttpError(400, "filters must be valid JSON");
    }
    if (!isRecord(parsed)) {
        throw new HttpError(400, "filters must be an object");
    }
    return compactFilters(parsed);
}

function compactFilters(filters: JsonRecord): JsonRecord {
    return Object.fromEntries(
        Object.entries(filters).flatMap(([field, rawOperators]) => {
            if (!isRecord(rawOperators)) {
                return [[field, rawOperators]];
            }
            const operators = Object.fromEntries(
                Object.entries(rawOperators).filter(
                    ([, value]) =>
                        value !== "" &&
                        value !== null &&
                        value !== undefined &&
                        (!Array.isArray(value) || value.length > 0),
                ),
            );
            return Object.keys(operators).length > 0 ? [[field, operators]] : [];
        }),
    );
}

function amount(raw: string | null): number | null {
    if (!raw) {
        return null;
    }
    const euros = Number(raw);
    if (!Number.isFinite(euros) || euros < 0) {
        throw new HttpError(400, "price filter is invalid");
    }
    return Math.round(euros * 100);
}
