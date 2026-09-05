export class HttpResponseError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

export function relayItem(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }
    const location = text(value.location) || text(value.relayLocation);
    const name = text(value.name);
    if (!location || !name) {
        return null;
    }
    return {
        location,
        number: text(value.number),
        country: text(value.country) || location.slice(0, 2),
        name,
        label: text(value.label) || name,
        addressLine1: text(value.addressLine1),
        addressLine2: text(value.addressLine2),
        postalCode: text(value.postalCode),
        city: text(value.city),
        latitude: finiteNumber(value.latitude),
        longitude: finiteNumber(value.longitude),
        nature: text(value.nature),
        pointType: text(value.pointType),
        warning: text(value.warning),
        shippingAmount: finiteNumber(value.shippingAmount),
        currency: text(value.currency),
    };
}

export function relayAddress(item) {
    return [item.addressLine1, item.addressLine2, item.postalCode, item.city].filter(Boolean).join(", ");
}

function text(value) {
    return typeof value === "string" ? value.trim() : "";
}

function finiteNumber(value) {
    if (value === null || value === undefined || value === "") {
        return null;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

export function headersObject(headers) {
    return headers ? Object.fromEntries(new Headers(headers).entries()) : {};
}

export function errorMessage(error) {
    if (error instanceof HttpResponseError && error.status === 401) {
        return "Sign in to choose a pickup point.";
    }
    if (error instanceof HttpResponseError && error.status === 403) {
        return "You are not allowed to change this pickup point.";
    }
    return "Pickup points cannot be searched right now. Try again shortly.";
}

export function errorMessageFromBody(body, response) {
    if (body && typeof body === "object" && "error" in body) {
        return String(body.error);
    }
    return `${response.status} ${response.statusText}`;
}

export function isNotFound(error) {
    return error instanceof HttpResponseError && error.status === 404;
}

export function isFramed() {
    try {
        return window.self !== window.top;
    } catch {
        return true;
    }
}
