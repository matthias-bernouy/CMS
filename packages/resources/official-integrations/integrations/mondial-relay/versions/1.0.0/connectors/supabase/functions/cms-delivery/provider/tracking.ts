import { requiredEnv } from "../env.ts";
import { ProviderStatusError } from "../http.ts";
import { md5 } from "./md5.ts";
import { mondialRelayTrackingEndpoint } from "./provider-endpoints.ts";
import {
    fallbackTrackingStatus,
    normalizeTrackingLabel,
    providerOccurredAt,
    statusAfterObservation,
    trackingEventKey,
} from "./tracking-status.ts";
import type { JsonRecord } from "../shipment/types.ts";
import { xmlBlocks, xmlEscape, xmlTag } from "./xml.ts";

export interface TrackingResult {
    status: string;
    statusCode: string;
    label: string;
    events: JsonRecord[];
    raw: JsonRecord;
}

export async function fetchTracking(expeditionNumber: string): Promise<TrackingResult> {
    const endpoint = mondialRelayTrackingEndpoint();
    const brand = requiredEnv("MONDIAL_RELAY_TRACKING_BRAND");
    const privateKey = requiredEnv("MONDIAL_RELAY_TRACKING_PRIVATE_KEY");
    const language = "FR";
    const security = md5(`${brand}${expeditionNumber}${language}${privateKey}`).toUpperCase();
    const response = await fetch(endpoint, {
        method: "POST",
        redirect: "manual",
        headers: {
            "content-type": "text/xml; charset=utf-8",
            soapaction: "http://www.mondialrelay.fr/webservice/WSI2_TracingColisDetaille",
        },
        body: `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <WSI2_TracingColisDetaille xmlns="http://www.mondialrelay.fr/webservice/">
      <Enseigne>${xmlEscape(brand)}</Enseigne>
      <Expedition>${xmlEscape(expeditionNumber)}</Expedition>
      <Langue>${language}</Langue>
      <Security>${security}</Security>
    </WSI2_TracingColisDetaille>
  </soap:Body>
</soap:Envelope>`,
    }).catch(() => {
        throw new ProviderStatusError(502, "Mondial Relay tracking request failed", trackingContext(false));
    });
    if (response.redirected || (response.status >= 300 && response.status < 400)) {
        throw new ProviderStatusError(502, "Mondial Relay tracking redirects are not allowed", trackingContext(false));
    }
    const source = await response.text();
    if (!response.ok) {
        throw new ProviderStatusError(
            502,
            `Mondial Relay tracking returned HTTP ${response.status}`,
            trackingContext(false),
        );
    }
    const statusCode = xmlTag(source, "STAT");
    if (!statusCode) {
        throw new ProviderStatusError(
            502,
            "Mondial Relay tracking returned an invalid response",
            trackingContext(false),
        );
    }
    if (!["80", "81", "82", "83"].includes(statusCode)) {
        throw new ProviderStatusError(
            502,
            `Mondial Relay tracking returned status ${statusCode}`,
            trackingContext(true, statusCode),
        );
    }
    const label = [xmlTag(source, "Libelle01"), xmlTag(source, "Libelle02")].filter(Boolean).join(" ");
    const events = xmlBlocks(source, "Tracing")
        .map((block) => ({
            event_label: xmlTag(block, "Libelle"),
            event_date: frenchDate(xmlTag(block, "Date")),
            event_time: xmlTag(block, "Heure") || undefined,
            location: xmlTag(block, "Emplacement") || undefined,
            relay_number: xmlTag(block, "Relais_Num") || undefined,
            relay_country: xmlTag(block, "Relais_Pays") || undefined,
            raw_event: {
                label: xmlTag(block, "Libelle"),
                date: xmlTag(block, "Date"),
                time: xmlTag(block, "Heure"),
                location: xmlTag(block, "Emplacement"),
            },
        }))
        .filter((event) => event.event_label)
        .map((event) => {
            const occurredAt = providerOccurredAt(event);
            const candidateStatus = normalizeTrackingLabel(String(event.event_label));
            const normalizedStatus =
                !occurredAt && (candidateStatus === "collected_by_recipient" || candidateStatus === "carrier_accepted")
                    ? null
                    : candidateStatus;
            return {
                ...event,
                normalized_status: normalizedStatus ?? undefined,
                occurred_at: occurredAt ?? undefined,
                provider_event_key: trackingEventKey(expeditionNumber, event),
            };
        });
    const summaryCandidate = normalizeTrackingLabel(label);
    const summaryStatus =
        summaryCandidate === "collected_by_recipient" || summaryCandidate === "carrier_accepted"
            ? null
            : summaryCandidate;
    const status = events
        .filter((event) => event.normalized_status)
        .sort(compareEvents)
        .reduce(
            (current, event) => statusAfterObservation(current, String(event.normalized_status)),
            summaryStatus ?? fallbackTrackingStatus(statusCode),
        );
    return {
        status,
        statusCode,
        label,
        events,
        raw: { statusCode, label },
    };
}

function compareEvents(left: JsonRecord, right: JsonRecord): number {
    return String(left.occurred_at ?? "").localeCompare(String(right.occurred_at ?? ""));
}

function frenchDate(value: string): string | undefined {
    const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return match ? `${match[3]}-${match[2]}-${match[1]}` : undefined;
}

function trackingContext(retrySafe: boolean, statusCode = ""): JsonRecord {
    return {
        operation: "WSI2_TracingColisDetaille",
        endpoint: mondialRelayTrackingEndpoint(),
        statusCode,
        retrySafe,
    };
}
