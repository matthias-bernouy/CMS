import type { NormalizedTrackingStatus } from "./state.ts";

export function normalizeTrackingLabel(value: string): NormalizedTrackingStatus | null {
    const label = fold(value);
    if (!label) {
        return null;
    }
    if (
        mentionsRecipient(label) &&
        /\b(non|pas|impossible|refuse|refusee|refus|echec|echoue|annule|not|unable|failed|failure|refused|cancelled|canceled)\b/.test(
            label,
        )
    ) {
        return "incident";
    }
    if (recipientHandoffLabels.has(label)) {
        return "collected_by_recipient";
    }
    if (
        matches(label, [
            /remis (a|au) l expediteur/,
            /retourne (a|au) l expediteur/,
            /returned to (the )?sender/,
            /return delivered to (the )?sender/,
        ])
    ) {
        return "returned_to_sender";
    }
    if (
        matches(label, [
            /retour (a|vers) l expediteur/,
            /en cours de retour/,
            /retourne? vers l expediteur/,
            /returning to (the )?sender/,
            /return in progress/,
        ])
    ) {
        return "returning_to_sender";
    }
    if (
        matches(label, [
            /delai de retrait (est )?depasse/,
            /non retire/,
            /non reclame/,
            /instance expiree/,
            /pickup (period )?expired/,
            /not collected/,
        ])
    ) {
        return "pickup_expired";
    }
    if (matches(label, [/colis (est )?perdu/, /declare perdu/, /perte (du )?colis/, /parcel lost/, /shipment lost/])) {
        return "lost";
    }
    if (
        matches(label, [
            /avarie/,
            /anomalie/,
            /incident/,
            /endommage/,
            /adresse (incorrecte|incomplete)/,
            /refuse par (le )?destinataire/,
            /parcel damaged/,
            /delivery exception/,
        ])
    ) {
        return "incident";
    }
    if (
        matches(label, [
            /disponible (au|dans le|en) point relais/,
            /disponible (au|dans le) locker/,
            /mis(e)? a disposition (du )?destinataire/,
            /a disposition (du )?destinataire/,
            /pret a etre retire/,
            /ready for (collection|pickup)/,
            /available for (collection|pickup)/,
        ])
    ) {
        return "available_for_pickup";
    }
    if (
        matches(label, [
            /arrive (au|dans le) point relais/,
            /arrive (au|dans le) locker/,
            /livre (au|dans le) point relais/,
            /livre (au|dans le) locker/,
            /depose (au|dans le) point relais/,
            /arrived at (the )?(parcel shop|pickup point|locker)/,
            /delivered to (the )?(parcel shop|pickup point|locker)/,
        ])
    ) {
        return "arrived_at_pickup_point";
    }
    if (
        matches(label, [
            /remis a mondial relay/,
            /pris en charge par mondial relay/,
            /mondial relay a pris en charge/,
            /depose par l expediteur/,
            /handed to mondial relay/,
            /received by mondial relay/,
            /carrier accepted/,
        ])
    ) {
        return "carrier_accepted";
    }
    if (
        matches(label, [
            /en acheminement/,
            /en transit/,
            /en traitement (sur|au|dans)/,
            /site logistique/,
            /agence de livraison/,
            /transport vers/,
            /in transit/,
            /at (the )?(sorting|logistics) (site|center)/,
        ])
    ) {
        return "in_transit";
    }
    if (mentionsRecipient(label)) {
        return "incident";
    }
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

function fold(value: string): string {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

function matches(value: string, patterns: RegExp[]): boolean {
    return patterns.some((pattern) => pattern.test(value));
}
