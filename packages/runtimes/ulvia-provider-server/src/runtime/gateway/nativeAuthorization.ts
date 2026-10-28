import { canonicalizeIJson } from "@bernouy/cms-repository/contracts/protocol";
import { GatewayAuthorityReads, type GatewayRouteResolver } from "@bernouy/cms-gateway";
import type { ProviderInvocationClaims } from "@bernouy/cms-gateway/protocol";
import { capabilityGranted, type ContractSelectionStore } from "@bernouy/cms-repository/providers/selections";
import type { ProviderInstallationStore, ProviderRuntimeReport } from "@bernouy/cms-repository/providers/installations";

/** A previously issued token cannot follow an old installation after a same-version redirect. */
export function createNativeInvocationAuthorizer(
    siteId: string,
    report: ProviderRuntimeReport,
    selections: Pick<ContractSelectionStore, "get">,
    installations: Pick<ProviderInstallationStore, "get">,
    routes: GatewayRouteResolver,
) {
    return async (claims: ProviderInvocationClaims, controlAuthority = false): Promise<boolean> => {
        if (claims.contractId === "ulvia.provider.connections") {
            return Boolean(
                claims.connectionId &&
                    !claims.subjectId &&
                    !claims.systemServiceId &&
                    !claims.sourceInstallationId &&
                    report.implementations.some(
                        (item) =>
                            item.contractId === claims.contractId &&
                            item.version === claims.contractVersion &&
                            item.status === "ready",
                    ),
            );
        }
        // A concurrent upgrade may change an unrelated contract while this snapshot is read.
        // Retry the complete authorization once; every destination and grant check remains fresh.
        for (let attempt = 0; attempt < 2; attempt++) {
            const reads = new GatewayAuthorityReads(siteId);
            const current = await reads.selection(selections, siteId);
            const route = await routes.resolve(siteId, claims.contractId, reads);
            const selection = current?.plan.selections.find(
                ({ contractId }) => contractId === route?.selection.contractId,
            );
            const requested = route?.requestedRelease.admission.release;
            const served = report.implementations.find(
                (pin) =>
                    pin.contractId === selection?.contractId &&
                    pin.version === selection.version &&
                    pin.digest === selection?.digest &&
                    pin.status === "ready",
            );
            if (
                !current ||
                !selection ||
                requested?.version !== claims.contractVersion ||
                requested.contractId !== claims.contractId ||
                !served ||
                claims.instanceId !== report.instanceId ||
                ((!controlAuthority || claims.contractId !== "ulvia.cms.installations") &&
                    claims.connectionId !== selection.installationId) ||
                !capabilityGranted(current.grants, selection.contractId, claims.capabilityId)
            ) {
                return false;
            }
            const installed = await installations.get({ siteId, installationId: selection.installationId });
            const matches = Boolean(
                installed &&
                    installed.installation.status === "enabled" &&
                    canonicalizeIJson(installed.installation) === canonicalizeIJson(route!.installation.installation) &&
                    installed.installation.providerId === report.providerId &&
                    installed.installation.accountId === report.account.id &&
                    installed.observation?.report.instanceId === report.instanceId &&
                    installed.observation.report.implementations.some(
                        (pin) =>
                            pin.contractId === selection.contractId &&
                            pin.version === selection.version &&
                            pin.digest === selection.digest &&
                            pin.status === "ready",
                    ),
            );
            if ((await selections.get(siteId))?.revision === current.revision) {
                return matches;
            }
        }
        return false;
    };
}
