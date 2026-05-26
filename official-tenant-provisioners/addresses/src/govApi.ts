import { BAN_BASE_URL } from "./constants";

/** Trimmed BAN feature shape (the upstream returns much more). Stable wire
 *  contract for our consumption endpoints — keep this narrow so callers
 *  don't depend on BAN-internal fields. */
export interface AddressSuggestion {
    /** Single-line label, formatted by BAN. */
    label:    string;
    /** Postal code (e.g. "75001"). */
    postcode: string;
    /** City name. */
    city:     string;
    /** WGS-84 coordinates. */
    lon:      number;
    lat:      number;
    /** BAN match score (0..1). Higher = better. */
    score:    number;
}

type BanFeature = {
    properties?: { label?: string; postcode?: string; city?: string; score?: number };
    geometry?:   { coordinates?: [number, number] };
};

function pickSuggestion(f: BanFeature): AddressSuggestion | null {
    const p = f.properties ?? {};
    const [lon, lat] = f.geometry?.coordinates ?? [NaN, NaN];
    if (!p.label || !p.postcode || !p.city || !Number.isFinite(lon) || !Number.isFinite(lat)) {
        return null;
    }
    return {
        label:    p.label,
        postcode: p.postcode,
        city:     p.city,
        lon,
        lat,
        score:    typeof p.score === "number" ? p.score : 0,
    };
}

/** Forward-geocode a free-text query against BAN. */
export async function banSearch(
    query: string,
    limit: number,
    fetchImpl: typeof fetch = fetch,
): Promise<AddressSuggestion[]> {
    const url = new URL(`${BAN_BASE_URL}/search/`);
    url.searchParams.set("q", query);
    url.searchParams.set("limit", String(limit));
    const r = await fetchImpl(url.toString(), { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(`BAN search returned ${r.status}`);
    const body = (await r.json()) as { features?: BanFeature[] };
    return (body.features ?? []).map(pickSuggestion).filter((s): s is AddressSuggestion => s !== null);
}

/** Reverse-geocode a coordinate pair against BAN. */
export async function banReverse(
    lat: number, lon: number,
    fetchImpl: typeof fetch = fetch,
): Promise<AddressSuggestion[]> {
    const url = new URL(`${BAN_BASE_URL}/reverse/`);
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lon));
    const r = await fetchImpl(url.toString(), { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(`BAN reverse returned ${r.status}`);
    const body = (await r.json()) as { features?: BanFeature[] };
    return (body.features ?? []).map(pickSuggestion).filter((s): s is AddressSuggestion => s !== null);
}
