import { deepFreeze } from "@bernouy/cms-repository/contracts/protocol";
import type { ReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";
import { capabilityGranted, type ProviderExecutionStateReader } from "@bernouy/cms-repository/providers/selections";
import { providerInvocationIsCurrent, type ProviderInvocationClaims } from "@bernouy/cms-gateway/protocol";
import type { ProviderRuntimeReport } from "@bernouy/cms-repository/providers/installations";
import { prepareNativeContracts } from "./contracts";
import { nativeInstallationMatches } from "./installation";

/** Consume verified capability leases; the private control channel retains current site authority checks. */
export function createNativeInvocationAuthorizer(options: {
    siteId: string;
    report: ProviderRuntimeReport;
    releases: ReleaseCatalogue;
    executionState: ProviderExecutionStateReader;
    nowSeconds?: () => number;
}) {
    const report = deepFreeze(structuredClone(options.report));
    const now = options.nowSeconds ?? (() => Math.floor(Date.now() / 1000));
    let controlInstallationHint: string | undefined;
    let compiled: Promise<Awaited<ReturnType<typeof prepareNativeContracts>>> | undefined;
    const contracts = () => {
        if (!compiled) {
            const pending = prepareNativeContracts(report, options.releases);
            compiled = pending;
            void pending.catch(() => {
                if (compiled === pending) {
                    compiled = undefined;
                }
            });
        }
        return compiled;
    };
    return async (claims: ProviderInvocationClaims, controlAuthority = false): Promise<boolean> => {
        if (claims.instanceId !== report.instanceId || !providerInvocationIsCurrent(claims, now())) {
            return false;
        }
        if (claims.contractId === "ulvia.provider.connections") {
            return Boolean(
                claims.connectionId &&
                    !claims.subjectId &&
                    !claims.systemServiceId &&
                    !claims.sourceInstallationId &&
                    report.implementations.some(
                        (pin) =>
                            pin.contractId === claims.contractId &&
                            pin.version === claims.contractVersion &&
                            pin.status === "ready",
                    ),
            );
        }
        const control = controlAuthority && claims.contractId === "ulvia.cms.installations";
        if (!control && !claims.connectionId) {
            return false;
        }
        const prepared = await contracts();
        if (!providerInvocationIsCurrent(claims, now())) {
            return false;
        }
        if (!control) {
            // The issuer granted this exact call. Signature, audience and expiry were verified by the host.
            return prepared.supports(claims);
        }
        let hint = controlInstallationHint;
        // Only a missing/stale control hint needs another lookup, with the newly selected ID.
        for (let attempt = 0; attempt < 2; attempt++) {
            const current = await options.executionState.read(options.siteId, hint ? [hint] : []);
            if (!providerInvocationIsCurrent(claims, now())) {
                return false;
            }
            const selections = current.selections;
            if (!selections || selections.siteId !== options.siteId) {
                return false;
            }
            const selection = prepared.select(selections.plan.selections, claims);
            if (
                !selection ||
                selection.siteId !== options.siteId ||
                !capabilityGranted(selections.grants, selection.contractId, claims.capabilityId)
            ) {
                return false;
            }
            if (hint !== selection.installationId) {
                hint = selection.installationId;
                continue;
            }
            const installed = current.installations.find((item) => item.installation.id === selection.installationId);
            const allowed = nativeInstallationMatches(options.siteId, report, selection, installed);
            if (allowed) {
                controlInstallationHint = selection.installationId;
            }
            return allowed;
        }
        return false;
    };
}
