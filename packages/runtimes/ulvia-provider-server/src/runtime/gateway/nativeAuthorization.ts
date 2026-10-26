import type { ProviderInvocationClaims } from "@bernouy/cms-gateway/protocol";
import { capabilityGranted, type ContractSelectionStore } from "@bernouy/cms-repository/providers/selections";
import type { ProviderInstallationStore, ProviderRuntimeReport } from "@bernouy/cms-repository/providers/installations";

/** A previously issued token cannot follow an old installation after a same-version redirect. */
export function createNativeInvocationAuthorizer(
    siteId: string,
    report: ProviderRuntimeReport,
    selections: Pick<ContractSelectionStore, "get">,
    installations: Pick<ProviderInstallationStore, "get">,
) {
    return async (claims: ProviderInvocationClaims): Promise<boolean> => {
        const current = await selections.get(siteId);
        const selection = current?.plan.selections.find(({ contractId }) => contractId === claims.contractId);
        const served = report.implementations.find(
            (pin) =>
                pin.contractId === claims.contractId &&
                pin.version === claims.contractVersion &&
                pin.digest === selection?.digest &&
                pin.status === "ready",
        );
        if (
            !current ||
            !selection ||
            selection.version !== claims.contractVersion ||
            !served ||
            claims.instanceId !== report.instanceId ||
            !capabilityGranted(current.grants, claims.contractId, claims.capabilityId)
        ) {
            return false;
        }
        const installed = await installations.get({ siteId, installationId: selection.installationId });
        const matches = Boolean(
            installed &&
                installed.installation.status === "enabled" &&
                installed.installation.providerId === report.providerId &&
                installed.installation.accountId === report.account.id &&
                installed.observation?.report.instanceId === report.instanceId &&
                installed.observation.report.implementations.some(
                    (pin) =>
                        pin.contractId === claims.contractId &&
                        pin.version === claims.contractVersion &&
                        pin.digest === selection.digest &&
                        pin.status === "ready",
                ),
        );
        return matches && (await selections.get(siteId))?.revision === current.revision;
    };
}
