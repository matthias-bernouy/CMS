import { admitProviderManifest } from "@bernouy/ulvia-providers";
import type { ContractReleaseReader } from "@bernouy/ulvia-contracts/catalogue";
import definition from "./definition.json";
import { compileOfficialFeatures } from "../../capabilities/features/build";

export { compileOfficialFeatures };

/** Remaining families retain explicit claims until each handler table migrates to the SDK. */
export async function compileOfficialManifest(
    catalogue: ContractReleaseReader,
    features: Awaited<ReturnType<typeof compileOfficialFeatures>>,
) {
    const implementations: unknown[] = [...features.implementations];
    for (const claim of definition.implementations) {
        const row = await catalogue.get(claim.contractId, claim.version);
        if (!row) {
            throw new Error(`Missing declared implementation: ${claim.contractId}@${claim.version}`);
        }
        implementations.push({ ...claim, digest: row.admission.digest });
    }
    return admitProviderManifest({ ...definition, implementations }, catalogue);
}
