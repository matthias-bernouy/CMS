export const profileFields = [
    "givenName",
    "surname",
    "birthDate",
    "email",
    "phone",
    "addressLine1",
    "postalCode",
    "city",
    "countryCode",
];

export class PublicError extends Error {}

export function stripeEnrollmentComplete(connect) {
    return (
        connect?.accountStatus === "active" &&
        connect?.stripeAccountApiVersion === "v2" &&
        connect?.applicationControlledRecipient === true &&
        connect?.stripeTermsStatus === "accepted"
    );
}

export function comparableProfileValue(field, value) {
    const normalized = textValue(value);
    return field === "countryCode" ? normalized.toUpperCase() : normalized;
}

export function validEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function profileFieldReady(field, value) {
    const normalized = textValue(value);
    if (!normalized) {
        return false;
    }
    if (field === "email") {
        return validEmail(normalized);
    }
    if (field === "countryCode") {
        return normalized.toUpperCase() === "FR";
    }
    if (field === "birthDate") {
        try {
            parseDate(normalized);
            return true;
        } catch {
            return false;
        }
    }
    return true;
}

export function parseDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) {
        throw new PublicError("La date de naissance doit respecter le format AAAA-MM-JJ.");
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
        throw new PublicError("Indique une date de naissance valide.");
    }
    return { year, month, day };
}

export function textValue(value) {
    return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}
