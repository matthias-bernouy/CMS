import type { ProviderReleaseRetention } from "@bernouy/cms-repository/providers/installations";
import type { ProviderManagementGateway } from "@bernouy/cms-repository/providers/management";
import type { SiteUpgradeStorage } from "@bernouy/cms-repository/upgrades";
import type { OfficialInstanceProfile } from "@bernouy/ulvia-provider";
import { catalogueRevision } from "@bernouy/cms-repository/contracts/protocol";
import type { ContractSelection } from "@bernouy/cms-repository/providers/selections";

export function createProviderRetention(
    gateway: ProviderManagementGateway,
    storage: SiteUpgradeStorage,
    profile: OfficialInstanceProfile,
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
            installed.installation.providerId === profile.manifest.providerId
        ) {
            releases.push(
                ...profile.contracts.map((pin) => ({ ...pin, location: `profile:${profile.id}@${profile.version}` })),
            );
        }
        return { complete: true, releases, revision: await catalogueRevision({ selected, active, releases }, 64) };
    };
    return { snapshot, isCurrent: async (scope, revision) => (await snapshot(scope)).revision === revision };
}
