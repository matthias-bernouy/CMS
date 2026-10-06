import { CoreCapabilityDispatchError, type CoreCapabilityRegistry } from "@bernouy/cms-content";
import type { ProductionGateway } from "../gateway/createProductionGateway";

export function registerProviderCapabilities(
    dispatcher: CoreCapabilityRegistry,
    gateway: ProductionGateway | undefined,
): void {
    dispatcher.register("ulvia.cms.providers", "list", async () => {
        if (!gateway) {
            throw new CoreCapabilityDispatchError("CORE_UNAVAILABLE", 503);
        }
        const [installed, selected] = await Promise.all([
            gateway.installations.list(gateway.siteId),
            gateway.selections.get(gateway.siteId),
        ]);
        return {
            installations: installed.map(({ installation, observation, revision }) => ({
                id: installation.id,
                providerId: installation.providerId,
                accountId: installation.accountId,
                endpoint: installation.endpoint,
                status: installation.status,
                manifestVersion: installation.approval.manifestVersion,
                revision,
                ...(observation ? { observedAt: observation.observedAt } : {}),
            })),
            selections:
                selected?.plan.selections.map(({ contractId, version, digest, installationId }) => ({
                    contractId,
                    version,
                    digest,
                    installationId,
                })) ?? [],
        };
    });
}
