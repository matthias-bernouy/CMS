import type { SystemInstallationPlan, SystemInstallationSource } from "@bernouy/ulvia-provider";
import { deepFreeze } from "@bernouy/ulvia-contracts/protocol";
import { loadSystemArtifacts, type LoadedSystemArtifacts } from "../artifacts";
import type { OfficialBootstrapSources } from "../bootstrap";

/** One admitted image snapshot. Provisioning records retain exact pins for recovery. */
export class SystemBootstrap implements SystemInstallationSource {
    private pending?: Promise<LoadedSystemArtifacts>;
    constructor(private readonly sources: OfficialBootstrapSources) {}
    async current(): Promise<SystemInstallationPlan> {
        const { plan } = await this.artifacts();
        return deepFreeze({
            ...plan,
            contracts: plan.contracts.filter(({ contractId }) => contractId !== "ulvia/repository"),
        });
    }
    async contracts(plan: SystemInstallationPlan) {
        const artifacts = await this.artifacts();
        if (artifacts.plan.manifest.digest !== plan.manifest.digest) {
            throw new Error("Provider image does not retain this unfinished system installation’s manifest");
        }
        return plan.contracts.map((pin) => {
            const contract = artifacts.contracts.find(
                ({ release, digest }) =>
                    release.contractId === pin.contractId && release.version === pin.version && digest === pin.digest,
            );
            if (!contract) {
                throw new Error("Provider image does not retain an unfinished system contract");
            }
            return contract;
        });
    }
    private artifacts() {
        if (!this.pending) {
            const pending = loadSystemArtifacts(this.sources.providers);
            this.pending = pending;
            void pending.catch(() => {
                if (this.pending === pending) {
                    this.pending = undefined;
                }
            });
        }
        return this.pending;
    }
}
