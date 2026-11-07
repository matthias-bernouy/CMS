import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { InMemoryReleaseCatalogue, publishContractSet } from "@bernouy/repository/contracts/catalogue";
import { prepareCollectionRelease } from "@bernouy/repository/collections/build";
import { compileOfficialFeatures, compileOfficialManifest } from "@bernouy/ulvia-provider/build";
import type { PreparedResource } from "../commands/release/resource";

/** One SDK inventory serves all official contracts and Provider claims; retained JSON is parity evidence only. */
export async function prepareOfficialResources(
    options: { includeCollections?: boolean } = {},
): Promise<readonly PreparedResource[]> {
    const root = resolve(import.meta.dir, "../../../../official-repository");
    const catalogue = new InMemoryReleaseCatalogue();
    const features = await compileOfficialFeatures();
    const ordered = await publishContractSet(catalogue, features.contracts);
    const resources: PreparedResource[] = ordered.map((admission) => ({ kind: "contract", admission }));
    resources.push({ kind: "provider-manifest", admission: await compileOfficialManifest(catalogue, features) });
    for (const id of options.includeCollections === false ? [] : await directories(join(root, "collections"))) {
        resources.push({
            kind: "collection",
            admission: await prepareCollectionRelease(join(root, "collections", id), catalogue),
        });
    }
    return resources;
}

async function directories(root: string): Promise<string[]> {
    return (await readdir(root, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
}
