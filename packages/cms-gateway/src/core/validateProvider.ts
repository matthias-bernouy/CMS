import type { Provider } from "../interfaces/Gateway";
import { isProviderUrn, isEndpointUrn, providerUrnOf } from "./urn";

/** `true` si l'urn d'endpoint appartient au provider donné. */
export function endpointBelongsToProvider(endpointUrn: string, providerUrn: string): boolean {
    return providerUrnOf(endpointUrn) === providerUrn;
}

/**
 * Valide un provider avant stockage. Retourne la liste des erreurs ([] = valide).
 * Pur — aucune I/O. À appeler côté création (API/seed) avant `repo.createProvider`.
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
