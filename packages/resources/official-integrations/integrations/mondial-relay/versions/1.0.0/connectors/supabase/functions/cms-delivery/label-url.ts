import { HttpError } from "./http.ts";

const mondialRelayLabelHosts = new Set([
    "connect-api.mondialrelay.com",
    "connect-api-sandbox.mondialrelay.com",
    "connect.mondialrelay.com",
    "connect-sandbox.mondialrelay.com",
]);

export function validatedMondialRelayLabelUrl(value: string): URL {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new HttpError(400, "Mondial Relay label URL is invalid");
    }
    if (
        url.protocol !== "https:"
        || url.port
        || url.username
        || url.password
        || !mondialRelayLabelHosts.has(url.hostname.toLowerCase())
    ) {
        throw new HttpError(400, "Mondial Relay label URL is not an allowed provider URL");
    }
    return url;
}
