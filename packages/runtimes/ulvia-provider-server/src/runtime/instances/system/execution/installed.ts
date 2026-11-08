import type { ProviderInstanceRecord } from "@bernouy/ulvia-provider";
import type { ResolvedContract } from "@bernouy/ulvia-contracts";
import { resolveContract } from "@bernouy/ulvia-contracts";
import { deepFreeze } from "@bernouy/ulvia-contracts/protocol";
import { validateProviderRuntimeReport } from "@bernouy/ulvia-providers/installations";
import type { ProviderRuntimeReport } from "@bernouy/ulvia-providers/installations";
import type { ProviderStores } from "../../../stores/providerStores";
import type { ExecutionPlan, ProviderExecutionSupport } from "./support";

export type InstalledExecution = Readonly<{
    plan: ExecutionPlan;
    contracts: readonly ResolvedContract[];
    report: ProviderRuntimeReport;
}>;

type Stores = Pick<ProviderStores, "releases" | "manifests" | "installations" | "selections">;

/** Reopens exact approved state; never reads a recipe, collection, or remote Repository. */
export async function readInstalledExecution(
    instance: ProviderInstanceRecord,
    stores: Stores,
    support: ProviderExecutionSupport,
    endpoint: string,
): Promise<InstalledExecution> {
    const candidates = (await stores.installations.list("default")).filter(
        ({ installation }) => installation.providerId === support.providerId && installation.accountId === instance.id,
    );
    if (candidates.length !== 1) {
        throw new Error(`Exact local Provider installation is unavailable or ambiguous: ${instance.id}`);
    }
    const { installation, observation } = candidates[0]!;
    const manifest = await stores.manifests.get(installation.providerId, installation.approval.manifestVersion);
    if (
        !manifest ||
        manifest.admission.digest !== installation.approval.manifestDigest ||
        installation.endpoint !== endpoint ||
        !observation
    ) {
        throw new Error(`Approved local Provider state is incomplete: ${instance.id}`);
    }
    const previous = validateProviderRuntimeReport(observation.report, manifest.admission, {
        endpoint,
        accountId: instance.id,
    });
    if (
        previous.instanceId !== instance.id ||
        !previous.implementations.length ||
        previous.implementations.some(({ status }) => status !== "ready")
    ) {
        throw new Error(`Provider observation does not describe the ready instance: ${instance.id}`);
    }
    const contracts: ResolvedContract[] = [];
    for (const pin of previous.implementations) {
        support.assert(pin, `instance:${instance.id}/implementation`);
        const stored = await stores.releases.get(pin.contractId, pin.version);
        if (!stored || stored.admission.digest !== pin.digest) {
            throw new Error(`Installed contract is unavailable: ${pin.contractId}@${pin.version}`);
        }
        contracts.push(await resolveContract(stores.releases, stored.admission));
    }
    const selected = await stores.selections.get("default");
    const own = selected?.plan.selections.filter(({ installationId }) => installationId === installation.id);
    if (
        !own?.some(({ contractId }) => contractId === "ulvia/cms.installations") ||
        own.some(
            (pin) =>
                !contracts.some(
                    ({ release, digest }) =>
                        release.contractId === pin.contractId &&
                        release.version === pin.version &&
                        digest === pin.digest,
                ),
        )
    ) {
        throw new Error(`Installed Provider contracts do not cover the current selections: ${instance.id}`);
    }
    const report: ProviderRuntimeReport = {
        ...previous,
        account: { id: instance.id, label: instance.label },
        buildVersion: support.buildVersion,
    };
    // Check the current build range independently from the historical observation.
    validateProviderRuntimeReport(report, manifest.admission, { endpoint, accountId: instance.id });
    return deepFreeze({
        plan: {
            manifest: {
                providerId: installation.providerId,
                version: installation.approval.manifestVersion,
                digest: installation.approval.manifestDigest,
            },
            contracts: contracts.map(({ release, digest }) => ({
                contractId: release.contractId,
                version: release.version,
                digest,
            })),
        },
        contracts,
        report,
    });
}
