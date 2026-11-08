import { admitProviderManifest } from "@bernouy/ulvia-providers";
import type { ContractReleaseReader } from "@bernouy/ulvia-contracts/catalogue";
import definition from "./definition.json";
import { compileOfficialFeatures } from "../../capabilities/features/build";

export { compileOfficialFeatures };
export { compileRetainedFeatures } from "../../capabilities/features/build";

/** All exact implementation claims and dependencies come from the selected SDK inventory. */
export async function compileOfficialManifest(
    catalogue: ContractReleaseReader,
    features: Awaited<ReturnType<typeof compileOfficialFeatures>>,
) {
    return admitProviderManifest({ ...definition, implementations: features.implementations }, catalogue);
}
