export function safeHttpUrl(value) {
    try {
        const url = new URL(String(value || ""));
        return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
    } catch {
        return "";
    }
}

export function safeCmsLabelUrl(value) {
    try {
        const url = new URL(String(value || ""), location.origin);
        return url.origin === location.origin && url.pathname.startsWith("/.cms/sources/") ? url.toString() : "";
    } catch {
        return "";
    }
}

export function statusLabel(value) {
    return (
        {
            creating: "Création en cours",
            created: "Expédition créée",
            label_ready: "Bordereau prêt",
            carrier_accepted: "Pris en charge par le transporteur",
            in_transit: "En cours d’acheminement",
            arrived_at_pickup_point: "Arrivé au point relais",
            available_for_pickup: "Disponible au point relais",
            collected_by_recipient: "Retiré par le destinataire",
            incident: "Incident de livraison",
            lost: "Colis perdu",
            pickup_expired: "Délai de retrait expiré",
            returning_to_sender: "Retour à l’expéditeur en cours",
            returned_to_sender: "Retourné à l’expéditeur",
            cancelled: "Annulée",
            failed: "Création échouée",
            unknown: "Vérification nécessaire",
        }[value] || "Prête à préparer"
    );
}

export function statusCopy(value) {
    if (value === "in_transit") {
        return "Le colis est en cours d’acheminement.";
    }
    if (value === "arrived_at_pickup_point") {
        return "Le colis est arrivé au point relais, mais n’a pas encore été retiré.";
    }
    if (value === "available_for_pickup") {
        return "Le colis est disponible au point relais.";
    }
    if (value === "collected_by_recipient") {
        return "Le transporteur confirme le retrait par le destinataire.";
    }
    if (value === "failed") {
        return "La création de l’expédition a échoué et peut être relancée.";
    }
    if (value === "unknown") {
        return "L’expédition doit être vérifiée avant une nouvelle tentative.";
    }
    return value ? "Le bordereau d’expédition est disponible." : "Crée le bordereau lorsque le colis est prêt.";
}

export function errorMessage(error) {
    const message = error instanceof Error ? error.message : String(error || "");
    return isFrenchUserMessage(message)
        ? message
        : "Le service de livraison est momentanément indisponible. Réessaie dans quelques instants.";
}

export function publicEventLabel(value, status) {
    const label = String(value || "").trim();
    return isFrenchUserMessage(label) ? label : statusCopy(status);
}

export function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFrenchUserMessage(value) {
    return (
        Boolean(value) &&
        /[àâçéèêëîïôùûüÿœ]|\b(?:le|la|les|un|une|des|du|de|au|aux|est|sont|colis|vente|expédition|bordereau|livraison|transporteur|relais|identifiant|statut|réponse)\b/i.test(
            value,
        )
    );
}

export function headers(value) {
    return value ? Object.fromEntries(new Headers(value).entries()) : {};
}
