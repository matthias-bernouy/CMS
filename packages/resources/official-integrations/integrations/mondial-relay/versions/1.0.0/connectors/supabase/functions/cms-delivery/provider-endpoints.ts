import { envDefault } from "./env.ts";
import { ProviderStatusError } from "./http.ts";

export const mondialRelayConnectProductionEndpoint = "https://connect-api.mondialrelay.com/api/shipment";
export const mondialRelayConnectSandboxEndpoint = "https://connect-api-sandbox.mondialrelay.com/api/shipment";
export const mondialRelayTrackingProductionEndpoint = "https://api.mondialrelay.com/WebService.asmx";

const connectEndpoints = new Set([
    mondialRelayConnectProductionEndpoint,
    mondialRelayConnectSandboxEndpoint,
]);
const trackingEndpoints = new Set([
    mondialRelayTrackingProductionEndpoint,
]);

export function mondialRelayConnectEndpoint(): string {
    return validatedProviderEndpoint(
        envDefault("MONDIAL_RELAY_CONNECT_ENDPOINT", mondialRelayConnectSandboxEndpoint),
        connectEndpoints,
        "Connect",
    );
}

export function mondialRelayTrackingEndpoint(): string {
    return validatedProviderEndpoint(
        envDefault("MONDIAL_RELAY_TRACKING_ENDPOINT", mondialRelayTrackingProductionEndpoint),
        trackingEndpoints,
        "tracking",
    );
}

function validatedProviderEndpoint(value: string, allowed: Set<string>, provider: string): string {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw invalidProviderEndpoint(provider);
    }

    const authority = value.match(/^https:\/\/([^/?#]*)/)?.[1] ?? "";
    const authorityWithoutCredentials = authority.slice(authority.lastIndexOf("@") + 1);
    if (
        url.protocol !== "https:"
        || url.username !== ""
        || url.password !== ""
        || url.port !== ""
        || authorityWithoutCredentials.includes(":")
        || url.search !== ""
        || url.hash !== ""
        || url.toString() !== value
        || !allowed.has(value)
    ) {
        throw invalidProviderEndpoint(provider);
    }
    return value;
}

function invalidProviderEndpoint(provider: string): ProviderStatusError {
    return new ProviderStatusError(
        500,
        `Mondial Relay ${provider} endpoint is not an allowed official endpoint`,
        { operation: "provider_endpoint_validation", provider },
    );
}
