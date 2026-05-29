import type { Provider } from "../interfaces/Gateway";
import { isProviderUrn, isEndpointUrn, providerUrnOf } from "./urn";

/** `true` if the endpoint urn belongs to the given provider. */
export function endpointBelongsToProvider(endpointUrn: string, providerUrn: string): boolean {
    return providerUrnOf(endpointUrn) === providerUrn;
}

/**
 * Validates a provider before storage. Returns the list of errors ([] = valid).
 * Pure — no I/O. Call on the creation side (API/seed) before `repo.createProvider`.
 */
export function validateProvider(provider: Provider): string[] {
    const errors: string[] = [];

    if (!isProviderUrn(provider.urn)) {
        errors.push(`urn de provider invalide : "${provider.urn}" (attendu "urn:<id>")`);
    }

    const seen = new Set<string>();
    for (const ep of provider.endpoints) {
        if (!isEndpointUrn(ep.urn)) {
            errors.push(`urn d'endpoint invalide : "${ep.urn}" (attendu "urn:<provider>:<endpoint>")`);
        } else if (!endpointBelongsToProvider(ep.urn, provider.urn)) {
            errors.push(`l'endpoint "${ep.urn}" n'appartient pas au provider "${provider.urn}"`);
        }

        if (seen.has(ep.urn)) errors.push(`urn d'endpoint dupliqué : "${ep.urn}"`);
        seen.add(ep.urn);

        if (!isParsableUrl(ep.targetUrl)) {
            errors.push(`targetUrl invalide pour "${ep.urn}" : "${ep.targetUrl}"`);
        }
    }

    return errors;
}

function isParsableUrl(value: string): boolean {
    try {
        new URL(value);
        return true;
    } catch {
        return false;
    }
}
