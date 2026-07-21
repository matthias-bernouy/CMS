import { envDefault } from "../env.ts";
import { HttpError, ProviderStatusError } from "../http.ts";
import type { JsonRecord } from "../shipment/types.ts";

type WidgetRelayPoint = {
    ID?: string;
    Nom?: string;
    Adresse1?: string;
    Adresse2?: string;
    CP?: string;
    Ville?: string;
    Pays?: string;
    Lat?: string;
    Long?: string;
    Nature?: string;
    Available?: boolean;
    Warning?: string;
    HoursHtmlTable?: string;
    Photo?: string | null;
};

type WidgetSearchResponse = {
    Error?: string | null;
    PRList?: WidgetRelayPoint[];
};

const widgetSearchEndpoint =
    "https://widget.mondialrelay.com/parcelshop-picker/v4_0/services/parcelshop-picker.svc/SearchPR";

export async function relayPointsFromUrl(url: URL): Promise<JsonRecord[]> {
    const brand = envDefault("MONDIAL_RELAY_WIDGET_BRAND", envDefault("MONDIAL_RELAY_CONNECT_CUSTOMER_ID", ""));
    if (!brand) {
        throw new HttpError(500, "Mondial Relay widget brand is not configured");
    }

    const params = lookupParams(url, brand);
    if (!params.get("PostCode") && !params.get("City") && !(params.get("Latitude") && params.get("Longitude"))) {
        return [];
    }

    const response = await fetch(`${widgetSearchEndpoint}?${params.toString()}`, {
        method: "GET",
        headers: { accept: "application/javascript, text/javascript, */*" },
    }).catch(() => {
        throw new ProviderStatusError(502, "Mondial Relay relay lookup request failed", providerContext(params));
    });
    const text = await response.text();
    if (!response.ok) {
        throw new ProviderStatusError(
            502,
            `Mondial Relay relay lookup returned HTTP ${response.status}`,
            providerContext(params),
        );
    }

    const body = parseJsonp(text);
    if (body.Error) {
        throw new ProviderStatusError(
            502,
            `Mondial Relay relay lookup returned an error: ${body.Error}`,
            providerContext(params),
        );
    }

    return (body.PRList ?? [])
        .filter((point) => point.Available !== false)
        .filter(isSupported24RRelayPoint)
        .map(normalizeRelayPoint)
        .filter((point) => point.location);
}

function lookupParams(url: URL, brand: string): URLSearchParams {
    const params = new URLSearchParams();
    params.set("method", "cmsRelayPoints");
    params.set("Brand", brand);
    params.set("Country", query(url, "country", "FR").toUpperCase());
    params.set("PostCode", query(url, "postalCode", query(url, "cp", "")));
    params.set("City", query(url, "city", ""));
    const modeDelivery = query(url, "modeDelivery", envDefault("MONDIAL_RELAY_DEFAULT_MODE_LIV", "24R")).toUpperCase();
    if (modeDelivery !== "24R") {
        throw new HttpError(400, "Mondial Relay relay lookup supports 24R only");
    }
    params.set("ColLivMod", modeDelivery);
    params.set("Weight", query(url, "weightGrams", query(url, "weight", "500")));
    params.set("NbResults", String(boundedInteger(query(url, "limit", "8"), 1, 8)));
    params.set("SearchDelay", query(url, "searchDelay", ""));
    params.set("SearchFar", query(url, "radiusKm", "75"));
    params.set("ClientContainerId", "cms-delivery");
    params.set("VacationBefore", "");
    params.set("VacationAfter", "");
    params.set("Service", "");
    params.set("Latitude", query(url, "latitude", query(url, "lat", "")));
    params.set("Longitude", query(url, "longitude", query(url, "lng", query(url, "lon", ""))));
    params.set("WidgetLanguage", query(url, "language", ""));
    return params;
}

function normalizeRelayPoint(point: WidgetRelayPoint): JsonRecord {
    const country = (point.Pays || "FR").toUpperCase();
    const number = point.ID || "";
    const location = number ? `${country}-${number}` : "";
    const name = point.Nom || "";
    const postalCode = point.CP || "";
    const city = point.Ville || "";
    const nature = normalizedNature(point.Nature);
    return {
        location,
        number,
        country,
        name,
        label: [name, postalCode, city].filter(Boolean).join(" - "),
        addressLine1: point.Adresse1 || "",
        addressLine2: point.Adresse2 || "",
        postalCode,
        city,
        latitude: coordinate(point.Lat),
        longitude: coordinate(point.Long),
        nature,
        pointType: nature === "C" ? "locker" : "relay_point",
        available: point.Available !== false,
        warning: stripHtml(point.Warning || ""),
        photo: point.Photo || "",
        openingHoursHtml: point.HoursHtmlTable || "",
    };
}

function isSupported24RRelayPoint(point: WidgetRelayPoint): boolean {
    return normalizedNature(point.Nature) !== "C";
}

function normalizedNature(value: string | undefined): string {
    return (value || "").trim().toUpperCase();
}

function parseJsonp(source: string): WidgetSearchResponse {
    const match = source.match(/^[^(]+\(\s*(.*)\s*\)\s*;?\s*$/s);
    if (!match?.[1]) {
        throw new HttpError(502, "Mondial Relay relay lookup returned an invalid response");
    }
    try {
        return JSON.parse(match[1]) as WidgetSearchResponse;
    } catch {
        throw new HttpError(502, "Mondial Relay relay lookup returned malformed JSONP");
    }
}

function providerContext(params: URLSearchParams): JsonRecord {
    return {
        operation: "widget.parcelshop-picker.SearchPR",
        endpoint: widgetSearchEndpoint,
        fields: {
            brand: params.get("Brand") ?? "",
            country: params.get("Country") ?? "",
            postalCode: params.get("PostCode") ?? "",
            city: params.get("City") ?? "",
            modeDelivery: params.get("ColLivMod") ?? "",
            weightGrams: params.get("Weight") ?? "",
            limit: params.get("NbResults") ?? "",
        },
    };
}

function query(url: URL, name: string, fallback: string): string {
    return url.searchParams.get(name)?.trim() || fallback;
}

function boundedInteger(value: string, min: number, max: number): number {
    const number = Number(value);
    if (!Number.isInteger(number)) {
        return min;
    }
    if (number < min) {
        return min;
    }
    if (number > max) {
        return max;
    }
    return number;
}

function coordinate(value: string | undefined): number | undefined {
    const number = Number((value || "").replace(",", "."));
    return Number.isFinite(number) ? number : undefined;
}

function stripHtml(value: string): string {
    return value
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
