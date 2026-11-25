import { resolveContract } from "@bernouy/ulvia-contracts";
import { satisfiesVersionRange } from "@bernouy/ulvia-providers";
import type { ProviderCapabilityRequirement } from "@bernouy/ulvia-providers";
import type { ReleaseCatalogue } from "@bernouy/repository/contracts/catalogue";
import type { LoadedSystemArtifacts } from "../../runtime/instances/system/artifacts";
/** Close only mandatory native dependencies; preserve all explicit foreign selections. */
export async function closeMigrationDependencies(
    pins: { siteId: string; installationId: string; contractId: string; version: string; digest: string }[],
    installationId: string,
    artifacts: LoadedSystemArtifacts,
    releases: ReleaseCatalogue,
) {
    const pending = [...artifacts.manifest.requires];
    const expanded = new Set<string>();
    const expand = () => {
        for (const claim of artifacts.manifest.implementations) {
            if (
                pins.some((pin) => pin.installationId === installationId && pin.contractId === claim.contractId) &&
                !expanded.has(claim.contractId)
            ) {
                expanded.add(claim.contractId);
                pending.push(...claim.requires);
            }
        }
    };
    const covers = (contract: LoadedSystemArtifacts["contracts"][number], requirement: ProviderCapabilityRequirement) =>
        contract.lineage.some(
            ({ release }) =>
                release.contractId === requirement.contractId &&
                satisfiesVersionRange(release.version, requirement.versionRange),
        ) && contract.capabilities.some(({ definition }) => definition.id === requirement.capabilityId);
    expand();
    for (let index = 0; index < pending.length; index++) {
        const requirement = pending[index]!;
        if (requirement.optional) {
            continue;
        }
        let present = false;
        for (const pin of pins) {
            const stored = await releases.get(pin.contractId, pin.version);
            if (stored && covers(await resolveContract(releases, stored.admission), requirement)) {
                present = true;
                break;
            }
        }
        if (present) {
            continue;
        }
        const matches = artifacts.contracts.filter((contract) => covers(contract, requirement));
        const candidates = matches.filter(
            (contract) => !pins.some((pin) => pin.contractId === contract.release.contractId),
        );
        if (candidates.length !== 1) {
            throw new Error("FORMS_MIGRATION_DEPENDENCY_UNAVAILABLE");
        }
        const { release, digest } = candidates[0]!;
        pins.push({
            siteId: "default",
            installationId,
            contractId: release.contractId,
            version: release.version,
            digest,
        });
        expand();
    }
}
