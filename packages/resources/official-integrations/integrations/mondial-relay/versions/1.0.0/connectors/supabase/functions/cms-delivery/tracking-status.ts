import type { JsonRecord } from "./types.ts";

export const normalizedStatuses = [
    "carrier_accepted",
    "in_transit",
    "arrived_at_pickup_point",
    "available_for_pickup",
    "collected_by_recipient",
    "incident",
    "lost",
    "pickup_expired",
    "returning_to_sender",
    "returned_to_sender",
] as const;

export type NormalizedTrackingStatus = typeof normalizedStatuses[number];

const terminalStatuses = new Set<string>([
    "collected_by_recipient",
    "lost",
    "returned_to_sender",
    "cancelled",
]);

const forwardRank: Record<string, number> = {
    creating: 0,
    created: 1,
    label_ready: 2,
    carrier_accepted: 3,
    in_transit: 4,
    arrived_at_pickup_point: 5,
    available_for_pickup: 6,
    collected_by_recipient: 7,
};

export function normalizeTrackingLabel(value: string): NormalizedTrackingStatus | null {
    const label = fold(value);
    if (!label) return null;
    if (mentionsRecipient(label) && /\b(non|pas|impossible|refuse|refusee|refus|echec|echoue|annule|not|unable|failed|failure|refused|cancelled|canceled)\b/.test(label)) {
        return "incident";
    }
    if (recipientHandoffLabels.has(label)) return "collected_by_recipient";
    if (matches(label, [
        /remis (a|au) l expediteur/,
        /retourne (a|au) l expediteur/,
        /returned to (the )?sender/,
        /return delivered to (the )?sender/,
    ])) return "returned_to_sender";
    if (matches(label, [
        /retour (a|vers) l expediteur/,
        /en cours de retour/,
        /retourne? vers l expediteur/,
        /returning to (the )?sender/,
        /return in progress/,
    ])) return "returning_to_sender";
    if (matches(label, [
        /delai de retrait (est )?depasse/,
        /non retire/,
        /non reclame/,
        /instance expiree/,
        /pickup (period )?expired/,
        /not collected/,
    ])) return "pickup_expired";
    if (matches(label, [
        /colis (est )?perdu/,
        /declare perdu/,
        /perte (du )?colis/,
        /parcel lost/,
        /shipment lost/,
    ])) return "lost";
    if (matches(label, [
        /avarie/,
        /anomalie/,
        /incident/,
        /endommage/,
        /adresse (incorrecte|incomplete)/,
        /refuse par (le )?destinataire/,
        /parcel damaged/,
        /delivery exception/,
    ])) return "incident";
    if (matches(label, [
        /disponible (au|dans le|en) point relais/,
        /disponible (au|dans le) locker/,
        /mis(e)? a disposition (du )?destinataire/,
        /a disposition (du )?destinataire/,
        /pret a etre retire/,
        /ready for (collection|pickup)/,
        /available for (collection|pickup)/,
    ])) return "available_for_pickup";
    if (matches(label, [
        /arrive (au|dans le) point relais/,
        /arrive (au|dans le) locker/,
        /livre (au|dans le) point relais/,
        /livre (au|dans le) locker/,
        /depose (au|dans le) point relais/,
        /arrived at (the )?(parcel shop|pickup point|locker)/,
        /delivered to (the )?(parcel shop|pickup point|locker)/,
    ])) return "arrived_at_pickup_point";
    if (matches(label, [
        /remis a mondial relay/,
        /pris en charge par mondial relay/,
        /mondial relay a pris en charge/,
        /depose par l expediteur/,
        /handed to mondial relay/,
        /received by mondial relay/,
        /carrier accepted/,
    ])) return "carrier_accepted";
    if (matches(label, [
        /en acheminement/,
        /en transit/,
        /en traitement (sur|au|dans)/,
        /site logistique/,
        /agence de livraison/,
        /transport vers/,
        /in transit/,
        /at (the )?(sorting|logistics) (site|center)/,
    ])) return "in_transit";
    if (mentionsRecipient(label)) return "incident";
    return null;
}

const recipientHandoffLabels = new Set([
    "remis au destinataire",
    "colis remis au destinataire",
    "remis a son destinataire",
    "colis remis a son destinataire",
    "livre au destinataire",
    "colis livre au destinataire",
    "retire par le destinataire",
    "colis retire par le destinataire",
    "collected by the recipient",
    "collected by recipient",
    "delivered to the recipient",
    "delivered to recipient",
    "shipment delivered successfully to the recipient",
]);

function mentionsRecipient(value: string): boolean {
    return /\b(destinataire|recipient|consignee|customer)\b/.test(value);
}

export function fallbackTrackingStatus(statusCode: string): string {
    if (statusCode === "80") return "created";
    if (statusCode === "81") return "in_transit";
    if (statusCode === "82") return "arrived_at_pickup_point";
    return "incident";
}

export function statusAfterObservation(current: string, observed: string): string {
    if (!observed || current === observed || terminalStatuses.has(current)) return current;
    if (observed === "returned_to_sender" || observed === "lost" || observed === "collected_by_recipient") {
        return observed;
    }
    if (current === "pickup_expired") {
        return observed === "returning_to_sender" ? observed : current;
    }
    if (current === "returning_to_sender") return current;
    if (observed === "returning_to_sender" || observed === "pickup_expired" || observed === "incident") {
        return observed;
    }
    if (current === "incident") return observed;
    const currentRank = forwardRank[current] ?? 0;
    const observedRank = forwardRank[observed] ?? 0;
    return observedRank >= currentRank ? observed : current;
}

export function providerOccurredAt(event: JsonRecord): string | null {
    const date = String(event.event_date ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const timeMatch = String(event.event_time ?? "00:00").replace(/h/i, ":").match(/^(\d{2}):(\d{2})/);
    const [year, month, day] = date.split("-").map(Number);
    const hour = Number(timeMatch?.[1] ?? 0);
    const minute = Number(timeMatch?.[2] ?? 0);
    if (![year, month, day, hour, minute].every(Number.isFinite)) return null;
    const wallClockUtc = Date.UTC(year, month - 1, day, hour, minute);
    const offset = parisOffsetMinutes(new Date(wallClockUtc));
    return new Date(wallClockUtc - offset * 60_000).toISOString();
}

export function trackingEventKey(expeditionNumber: string, event: JsonRecord): string {
    return [
        "mondial-relay",
        expeditionNumber,
        event.event_date,
        event.event_time,
        event.event_label,
        event.location,
        event.relay_country,
        event.relay_number,
    ].map(value => String(value ?? "").trim()).join("|");
}

function parisOffsetMinutes(date: Date): number {
    const zone = new Intl.DateTimeFormat("en", {
        timeZone: "Europe/Paris",
        timeZoneName: "shortOffset",
        year: "numeric",
    }).formatToParts(date).find(part => part.type === "timeZoneName")?.value ?? "GMT+1";
    const match = zone.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    if (!match) return 60;
    const minutes = Number(match[2]) * 60 + Number(match[3] ?? 0);
    return match[1] === "-" ? -minutes : minutes;
}

function fold(value: string): string {
    return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function matches(value: string, patterns: RegExp[]): boolean {
    return patterns.some(pattern => pattern.test(value));
}
