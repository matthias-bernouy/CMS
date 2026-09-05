import { envDefault, localProviderSimulationEnabled } from "../../env.ts";
import { HttpError, ProviderStatusError } from "../../http.ts";
import type { JsonRecord } from "../../shipment/types.ts";
import { lookupParams } from "./query.ts";
import { isSupported24RRelayPoint, normalizeRelayPoint, parseJsonp } from "./response.ts";

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
    if (localProviderSimulationEnabled()) {
        const postalCode = params.get("PostCode") ?? "75001";
        const city = params.get("City") ?? "Paris";
        return [
            {
                location: "FR-ULVIA01",
                number: "ULVIA01",
                country: "FR",
                name: "Ulvia Local Relay",
                label: `Ulvia Local Relay - ${postalCode} - ${city}`,
                addressLine1: "1 rue du Test Local",
                addressLine2: "",
                postalCode,
                city,
                latitude: 48.8566,
                longitude: 2.3522,
                nature: "R",
                pointType: "relay_point",
                available: true,
                warning: "",
                photo: "",
                openingHoursHtml: "",
            },
        ];
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
