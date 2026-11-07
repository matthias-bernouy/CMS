import { OfficialInstanceProfiles, canUpgradeOfficialInstanceProfile } from "@bernouy/ulvia-provider";
import type { OfficialInstanceProfile, OfficialInstanceProfileSource } from "@bernouy/ulvia-provider";
import type { LoadedOfficialArtifacts } from "../artifacts";

/** Installation resources are loaded only when an operator requests provisioning or recovery. */
export class LazyOfficialProfiles implements OfficialInstanceProfileSource {
    private pending?: Promise<LoadedOfficialArtifacts & { index: OfficialInstanceProfiles }>;

    constructor(private readonly load: () => Promise<LoadedOfficialArtifacts>) {}

    async describe() {
        return (await this.artifacts()).index.describe();
    }

    async resolve(id: string, version: string) {
        return (await this.artifacts()).index.resolve(id, version);
    }

    canUpgrade(source: OfficialInstanceProfile, target: OfficialInstanceProfile): boolean {
        return canUpgradeOfficialInstanceProfile(source, target);
    }

    async contracts(profile: OfficialInstanceProfile) {
        const artifacts = await this.artifacts();
        const contracts = profile.contracts.map((pin) =>
            artifacts.contracts.find(
                ({ release, digest }) =>
                    release.contractId === pin.contractId && release.version === pin.version && digest === pin.digest,
            ),
        );
        if (contracts.some((contract) => !contract)) {
            throw new Error("Provisioning contracts are unavailable");
        }
        return contracts.filter((contract) => contract !== undefined);
    }

    private artifacts() {
        if (!this.pending) {
            const pending = this.load().then((artifacts) => ({
                ...artifacts,
                index: new OfficialInstanceProfiles(artifacts.profiles, artifacts.defaultProfile),
            }));
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
