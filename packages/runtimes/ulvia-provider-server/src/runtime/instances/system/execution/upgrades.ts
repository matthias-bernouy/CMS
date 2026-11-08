import { createHash } from "node:crypto";
import { compareContractReleases } from "@bernouy/ulvia-contracts/compatibility";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertSystemUpgrade } from "@bernouy/ulvia-provider";
import type { ProviderInstanceRecord, SystemUpgradeInput, SystemUpgradeReview } from "@bernouy/ulvia-provider";
import type { ProviderStores } from "../../../stores/providerStores";
import type { ProviderExecutionSupport } from "./support";
import type { SystemBootstrap } from "./SystemBootstrap";
import { readInstalledExecution } from "./installed";

/** Review the exact shipped release; merely replacing an image never invokes this operation. */
export async function reviewSystemUpgrade(
    instance: ProviderInstanceRecord,
    input: SystemUpgradeInput,
    stores: Pick<ProviderStores, "releases" | "manifests" | "installations" | "selections">,
    support: ProviderExecutionSupport,
    system: SystemBootstrap,
    endpoint: string,
): Promise<SystemUpgradeReview> {
    if (instance.status !== "ready" || instance.revision !== input.expectedRevision) {
        throw Object.assign(new Error("System upgrade requires the current ready instance revision"), { status: 409 });
    }
    const available = await system.available();
    if (available.manifest.digest !== input.manifestDigest) {
        throw new TypeError("Requested manifest is not the exact release shipped by this image");
    }
    const { plan: source } = await readInstalledExecution(instance, stores, support, endpoint);
    const enabled = new Set(source.contracts.map(({ contractId }) => contractId));
    const target = { ...available, contracts: available.contracts.filter(({ contractId }) => enabled.has(contractId)) };
    assertSystemUpgrade(source, target);
    const contracts = await system.contracts(target);
    for (const before of source.contracts) {
        const next = contracts.find(({ release }) => release.contractId === before.contractId);
        if (!next) {
            throw new Error("System release omits an enabled contract");
        }
        support.assert(
            { contractId: next.release.contractId, version: next.release.version, digest: next.digest },
            "system upgrade",
        );
        if (next.digest === before.digest) {
            continue;
        }
        const previous = await stores.releases.get(before.contractId, before.version);
        if (!previous || previous.admission.digest !== before.digest) {
            throw new Error("Exact source contract disappeared during system review");
        }
        const comparison = compareContractReleases(previous.admission.release, next.release);
        if (!comparison.validEvolution || !comparison.consumerCompatible) {
            throw new Error(`System contract is not consumer compatible: ${before.contractId}`);
        }
    }
    const planDigest = `sha256:${createHash("sha256")
        .update(
            canonicalizeIJson({
                instanceId: instance.id,
                administratorSub: input.administratorSub,
                expectedRevision: instance.revision,
                source,
                target,
            }),
        )
        .digest("hex")}`;
    return { expectedRevision: instance.revision, source, target, planDigest };
}
