import { satisfiesVersionRange } from "@bernouy/cms-repository/providers";
import type { ProviderManagement } from "@bernouy/cms-repository/providers/management";
import type { ProviderAdministration } from "@bernouy/ulvia-provider";
import type { ProviderStores } from "../../stores/providerStores";
import type { createProviderGateway } from "../createProviderGateway";
import { ProviderPairing } from "./connections/ProviderPairing";

export function providerAdministration(
    stores: ProviderStores,
    gateway: Awaited<ReturnType<typeof createProviderGateway>>,
    management: ProviderManagement,
    cmsUrl: string,
): ProviderAdministration {
    const pairing = new ProviderPairing(stores, gateway, cmsUrl);
    return {
        catalogue: () => management.catalogue(),
        importReference: (input) => management.importReference(input),
        preview: (input, actor) => management.preview(input, actor),
        approve: async (ticket, actor) => {
            const result = await management.approve(ticket, actor);
            const source = await stores.installations.get({
                siteId: gateway.siteId,
                installationId: result.installationId,
            });
            if (!source) {
                throw new Error("Provider installation unavailable");
            }
            await pairing.configure(
                {
                    installationId: result.installationId,
                    expectedRevision: source.revision,
                    rotate: result.operation === "reconnect",
                },
                actor,
                ticket,
            );
            return result;
        },
        pair: (input, actor) => pairing.configure(input, actor),
        access: async (installationId) => {
            const stored = await stores.installations.get({ siteId: gateway.siteId, installationId });
            if (!stored) {
                throw new TypeError("Provider installation not found");
            }
            const manifest = await stores.manifests.get(
                stored.installation.providerId,
                stored.installation.approval.manifestVersion,
            );
            if (!manifest || manifest.admission.digest !== stored.installation.approval.manifestDigest) {
                throw new TypeError("Provider manifest unavailable");
            }
            const current = await stores.selections.get(gateway.siteId);
            const requirements = new Map(
                [
                    ...manifest.admission.manifest.requires,
                    ...manifest.admission.manifest.implementations
                        .filter((item) =>
                            current?.plan.selections.some(
                                (selection) =>
                                    selection.installationId === installationId &&
                                    selection.contractId === item.contractId &&
                                    selection.version === item.version &&
                                    selection.digest === item.digest,
                            ),
                        )
                        .flatMap((item) => item.requires),
                ].map((item) => [
                    `${item.contractId}:${item.capabilityId}:${item.versionRange}:${item.optional}`,
                    item,
                ]),
            );
            const selectedRequirement = async (
                requirement: (typeof manifest.admission.manifest.implementations)[number]["requires"][number],
            ) => {
                const route = await gateway.routes.resolve(gateway.siteId, requirement.contractId);
                const release = route?.requestedRelease.admission.release;
                return Boolean(
                    release &&
                        satisfiesVersionRange(release.version, requirement.versionRange) &&
                        release.capabilities.some((capability) => capability.id === requirement.capabilityId) &&
                        (await gateway.providers.authorize({
                            sourceInstallationId: installationId,
                            targetInstallationId: route!.selection.installationId,
                            contractId: requirement.contractId,
                            capabilityId: requirement.capabilityId,
                            version: release.version,
                        })),
                );
            };
            const requests = await Promise.all(
                [...requirements.values()].map(async (requirement) => ({
                    ...requirement,
                    selected: await selectedRequirement(requirement),
                })),
            );
            return {
                installationId,
                providerId: stored.installation.providerId,
                revision: stored.revision,
                paired: Boolean(stored.installation.gatewayTokenRef),
                endpoint: stored.installation.endpoint,
                manifestVersion: stored.installation.approval.manifestVersion,
                requests,
            };
        },
    };
}
