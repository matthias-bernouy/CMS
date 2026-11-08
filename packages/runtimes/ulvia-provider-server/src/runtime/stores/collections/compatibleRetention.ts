import type { ExecutionPlan } from "../../instances/system/execution/support";
import { resolveContract } from "@bernouy/ulvia-contracts";
import { compareContractReleases, semVerMajor } from "@bernouy/ulvia-contracts/compatibility";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import type { ProviderReleaseRetention } from "@bernouy/repository/providers/installations";
import type { ProviderManagementGateway } from "@bernouy/repository/providers/management";
import type { ProviderInstanceTransitionExecution } from "@bernouy/ulvia-provider";

/** Only the provisioner receives this policy while the instance is fenced from live traffic. */
export function compatibleTransitionRetention(
    retention: ProviderReleaseRetention,
    gateway: ProviderManagementGateway,
    instanceId: string,
    target: ExecutionPlan,
    execution: ProviderInstanceTransitionExecution,
): ProviderReleaseRetention {
    return {
        snapshot: async (scope) => {
            execution.throwIfLeaseLost();
            return retention.snapshot(scope);
        },
        isCurrent: async (scope, revision) => {
            execution.throwIfLeaseLost();
            return retention.isCurrent(scope, revision);
        },
        canReplace: async (candidate, previous, next) => {
            execution.throwIfLeaseLost();
            if (
                candidate.siteId !== gateway.siteId ||
                candidate.accountId !== instanceId ||
                candidate.providerId !== target.manifest.providerId ||
                candidate.manifestVersion !== target.manifest.version ||
                candidate.manifestDigest !== target.manifest.digest ||
                !target.contracts.some(
                    (pin) =>
                        pin.contractId === next.contractId &&
                        pin.version === next.version &&
                        pin.digest === next.digest,
                ) ||
                semVerMajor(previous.version) !== semVerMajor(next.version)
            ) {
                return false;
            }
            const evidence = await retention.snapshot({ siteId: candidate.siteId, installationId: candidate.id });
            if (!evidence.complete || evidence.releases.some((pin) => pin.location.startsWith("transition:"))) {
                return false;
            }
            const [before, after] = await Promise.all([
                gateway.releases.get(previous.contractId, previous.version),
                gateway.releases.get(next.contractId, next.version),
            ]);
            if (
                !before ||
                !after ||
                before.admission.digest !== previous.digest ||
                after.admission.digest !== next.digest ||
                after.yank
            ) {
                return false;
            }
            const comparison = compareContractReleases(before.admission.release, after.admission.release);
            if (!comparison.validEvolution || !comparison.consumerCompatible) {
                return false;
            }
            const [oldContract, newContract] = await Promise.all([
                resolveContract(gateway.releases, before.admission),
                resolveContract(gateway.releases, after.admission),
            ]);
            // Consumer compatibility alone does not prove that an old HTTP route remains executable.
            return oldContract.capabilities.every(({ definition }) => {
                const replacement = newContract.capabilities.find(
                    (item) => item.definition.id === definition.id,
                )?.definition;
                return (
                    replacement &&
                    definition.bindings
                        .filter((binding) => binding.transport === "http")
                        .every((binding) =>
                            replacement.bindings.some((item) => canonicalizeIJson(item) === canonicalizeIJson(binding)),
                        )
                );
            });
        },
    };
}
