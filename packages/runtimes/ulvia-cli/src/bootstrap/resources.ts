import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { InMemoryReleaseCatalogue, publishContractSet } from "@bernouy/cms-repository/contracts/catalogue";
import { prepareContractSource } from "@bernouy/cms-repository/repository/authoring/build";
import { prepareCollectionRelease } from "@bernouy/cms-repository/collections/build";
import { compileEmailReleases, compileOfficialManifest } from "@bernouy/ulvia-provider/build";
import type { PreparedResource } from "../commands/release/resource";

/** One source inventory serves bootstrap and publication; retained email JSON is parity evidence only. */
export async function prepareOfficialResources(): Promise<readonly PreparedResource[]> {
    const root = resolve(import.meta.dir, "../../../../official-repository");
    const catalogue = new InMemoryReleaseCatalogue();
    const email = await compileEmailReleases();
    const admissions = [...email.contracts];
    const migrated = new Set(email.contracts.map(({ release }) => release.contractId));
    for (const id of await directories(join(root, "contracts"))) {
        if (!migrated.has(`ulvia/${id}`)) {
            admissions.push((await prepareContractSource(join(root, "contracts", id))).admission);
        }
    }
    const ordered = await publishContractSet(catalogue, admissions);
    const resources: PreparedResource[] = ordered.map((admission) => ({ kind: "contract", admission }));
    resources.push({ kind: "provider-manifest", admission: await compileOfficialManifest(catalogue, email) });
    for (const id of await directories(join(root, "collections"))) {
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
