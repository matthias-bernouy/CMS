import { admitContractBundleJson, admitContractReleaseJson, parseContractReleaseJson } from "@bernouy/ulvia-contracts";
import type { ProviderRepositorySource, RepositoryArtifactReference } from "repository/providers/sources/interfaces";

/** Fetch bounded immutable documentation only during import, never during live invocation. */
export async function loadDocumentedContract(
    source: ProviderRepositorySource,
    reference: RepositoryArtifactReference,
    supplied?: Uint8Array,
) {
    const bytes = supplied ?? (await source.get(reference));
    const release = parseContractReleaseJson(bytes);
    const metadata = await admitContractReleaseJson(bytes);
    if (
        metadata.digest !== reference.digest ||
        release.contractId !== reference.id ||
        release.publisherId !== reference.publisherId ||
        release.version !== reference.version
    ) {
        throw new Error("Repository contract identity or digest mismatch");
    }
    if (!release.documentation?.length) {
        return metadata;
    }
    if (!source.getAsset) {
        throw new Error("Repository source cannot retrieve declared documentation");
    }
    const assets = [];
    for (const document of release.documentation) {
        const id = `docs/${document.path}`;
        assets.push({ id, bytes: await source.getAsset(reference, id, document.byteLength) });
    }
    return admitContractBundleJson(bytes, assets);
}
