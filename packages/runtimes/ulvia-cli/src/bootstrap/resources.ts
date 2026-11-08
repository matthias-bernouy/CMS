import { InMemoryReleaseCatalogue, publishContractSet } from "@bernouy/repository/contracts/catalogue";
import { compileOfficialFeatures, compileOfficialManifest } from "@bernouy/ulvia-provider/build";
import type { PreparedResource } from "../commands/release/resource";

/** One SDK inventory generates official contracts and Provider claims without authored repository scans. */
export async function prepareOfficialResources(): Promise<readonly PreparedResource[]> {
    const catalogue = new InMemoryReleaseCatalogue();
    const features = await compileOfficialFeatures();
    const ordered = await publishContractSet(catalogue, features.contracts);
    const resources: PreparedResource[] = ordered.map((admission) => ({ kind: "contract", admission }));
    resources.push({ kind: "provider-manifest", admission: await compileOfficialManifest(catalogue, features) });
    return resources;
}
