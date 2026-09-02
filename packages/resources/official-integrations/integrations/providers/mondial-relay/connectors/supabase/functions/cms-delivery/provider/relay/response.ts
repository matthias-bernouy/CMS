import { HttpError } from "../../http.ts";
import type { JsonRecord } from "../../shipment/types.ts";

export type WidgetRelayPoint = {
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

export type WidgetSearchResponse = {
    Error?: string | null;
    PRList?: WidgetRelayPoint[];
};

export function normalizeRelayPoint(point: WidgetRelayPoint): JsonRecord {
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

export function isSupported24RRelayPoint(point: WidgetRelayPoint): boolean {
    return normalizedNature(point.Nature) !== "C";
}

function normalizedNature(value: string | undefined): string {
    return (value || "").trim().toUpperCase();
}

export function parseJsonp(source: string): WidgetSearchResponse {
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
