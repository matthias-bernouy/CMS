import { CmsDocumentation } from "@bernouy/documentation";
import type { DocumentationEmbeddings, DocumentationScope } from "@bernouy/documentation";
import { MongoDocumentationVectors } from "@bernouy/documentation/mongo";
import type { AdmittedContractRelease } from "@bernouy/ulvia-contracts";
import type { ProviderStores } from "../../stores/providerStores";

export async function createInstanceDocumentation(
    stores: ProviderStores,
    model: DocumentationEmbeddings,
    requestPreparation?: () => void,
): Promise<CmsDocumentation> {
    const vectors = new MongoDocumentationVectors(stores.db);
    const selections = stores.selectionChanges.store;
    // This store belongs to the authenticated instance's private database.
    const siteId = "default";
    let cached: DocumentationScope | undefined;
    return new CmsDocumentation(
        {
            async resolve() {
                const selected = await selections.get(siteId);
                const revision = String(selected?.revision ?? 0);
                if (cached?.revision === revision) {
                    return cached;
                }
                const releases = new Map<string, AdmittedContractRelease>();
                for (const selection of selected?.plan.selections ?? []) {
                    let record = await stores.releases.get(selection.contractId, selection.version);
                    if (!record || record.admission.digest !== selection.digest) {
                        throw new Error("Selected documentation release is unavailable");
                    }
                    const visited = new Set<string>();
                    while (record) {
                        const admission = record.admission;
                        if (visited.has(admission.digest) || releases.size >= 128) {
                            throw new Error("Documentation lineage exceeds limits");
                        }
                        visited.add(admission.digest);
                        releases.set(admission.digest, admission);
                        const parent = admission.release.extends;
                        if (!parent) {
                            break;
                        }
                        record = await stores.releases.get(parent.contractId, parent.version);
                        if (!record || record.admission.digest !== parent.digest) {
                            throw new Error("Documentation parent digest mismatch");
                        }
                    }
                }
                cached = { revision, releases: [...releases.values()] };
                return cached;
            },
            async isCurrent(revision) {
                return String((await selections.get(siteId))?.revision ?? 0) === revision;
            },
            read: (reference) => stores.releases.readDocumentation(reference.releaseDigest, reference.path),
        },
        model,
        vectors,
        undefined,
        requestPreparation,
    );
}
