import type { ExecutionPlan } from "../../instances/system/execution/support";
import type { ProviderReleaseRetention } from "@bernouy/repository/providers/installations";
import type { ProviderManagementGateway } from "@bernouy/repository/providers/management";
import type { SiteUpgradeStorage } from "@bernouy/repository/upgrades";

import { catalogueRevision } from "@bernouy/ulvia-contracts/protocol";
import type { ContractSelection } from "@bernouy/ulvia-providers/selections";

export function createProviderRetention(
    gateway: ProviderManagementGateway,
    storage: SiteUpgradeStorage,
    plan: ExecutionPlan,
    instanceId: string,
): ProviderReleaseRetention {
    const snapshot: ProviderReleaseRetention["snapshot"] = async (scope) => {
        const [selected, installed, active] = await Promise.all([
            gateway.selections.get(scope.siteId),
            gateway.installations.get(scope),
            storage.getActive(scope.siteId),
        ]);
        const pending =
            active?.kind === "contracts"
                ? await storage.get<{ selections: readonly ContractSelection[] }>(scope.siteId, active.id, "contracts")
                : null;
        const releases: { contractId: string; version: string; digest: string; location: string }[] = (
            selected?.plan.selections ?? []
        )
            .filter(({ installationId }) => installationId === scope.installationId)
            .map((pin) => ({
                contractId: pin.contractId,
                version: pin.version,
                digest: pin.digest,
                location: `site:${scope.siteId}/selection/${pin.contractId}`,
            }));
        for (const pin of pending?.payload.selections ?? []) {
            if (pin.installationId === scope.installationId) {
                releases.push({
                    contractId: pin.contractId,
                    version: pin.version,
                    digest: pin.digest,
                    location: `transition:${pending!.id}/target/${pin.contractId}`,
                });
            }
        }
        if (
            installed?.installation.accountId === instanceId &&
            installed.installation.providerId === plan.manifest.providerId
        ) {
            releases.push(
                ...plan.contracts.map((pin) => ({ ...pin, location: `instance:${instanceId}/implementation` })),
            );
        }
        return { complete: true, releases, revision: await catalogueRevision({ selected, active, releases }, 64) };
    };
    return { snapshot, isCurrent: async (scope, revision) => (await snapshot(scope)).revision === revision };
}
