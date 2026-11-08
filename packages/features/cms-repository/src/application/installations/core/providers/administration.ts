import type { InstallationServices } from "cms-repository/application/installations/interfaces/services";
import type { ProviderAdministration } from "cms-repository/application/installations/interfaces/management";
import type { ImportProviderManifestInput } from "cms-repository/application/installations/interfaces/inputs";
import { required } from "cms-repository/application/installations/core/requirements";
export function administration(services: InstallationServices) {
    return required(services.management?.administration);
}
export async function availableProviders(service: ProviderAdministration) {
    const entries = await service.catalogue();
    return {
        items: entries.map(({ repositoryId, publisherId, id, version, digest, name }) => ({
            repositoryId,
            publisherId,
            id,
            version,
            digest,
            name,
        })),
    };
}
export async function importManifest(service: ProviderAdministration, input: ImportProviderManifestInput) {
    const value = await service.importReference(input);
    return { id: value.id, version: value.version, digest: value.digest };
}
