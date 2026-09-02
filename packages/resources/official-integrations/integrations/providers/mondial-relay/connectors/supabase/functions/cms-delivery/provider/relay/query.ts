import { envDefault } from "../../env.ts";
import { HttpError } from "../../http.ts";

export function lookupParams(url: URL, brand: string): URLSearchParams {
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
