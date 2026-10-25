import { verifyStoredCollectionArtifact } from "@bernouy/cms-repository/collections";
import { join } from "node:path";
import { CollectionAuthoring } from "@bernouy/cms-repository/repository/authoring";
import type { HttpCollectionRepository } from "@bernouy/cms-repository/collections/http";
import type { ProviderStores } from "../providerStores";
import type { CmsFileWorkspace } from "../CmsFileWorkspace";
import { RepositoryPublisher } from "./RepositoryPublisher";

export function createCollectionAuthoring(
    stores: ProviderStores,
    filesDirectory: string,
    repositoryUrl: string,
    source: HttpCollectionRepository,
    fileWorkspace: CmsFileWorkspace,
    allowInsecureHttp = false,
) {
    return new CollectionAuthoring(
        {
            root: join(filesDirectory, "collection-preparations"),
            contracts: stores.releases,
            readAsset: async (asset) => {
                if (asset.fileId && asset.generation) {
                    return fileWorkspace.readAsset(asset.fileId, asset.generation);
                }
                const bundle = await source.get({
                    publisherId: asset.publisherId!,
                    collectionId: asset.collectionId!,
                    version: asset.version!,
                    digest: asset.releaseDigest!,
                });
                const verified = await verifyStoredCollectionArtifact(
                    bundle.release,
                    bundle.assets,
                    asset.releaseDigest,
                );
                const found = verified.assets.find((item) => item.id === asset.assetId);
                if (!found) {
                    throw new Error("Source asset is unavailable");
                }
                return found.bytes instanceof Blob ? found.bytes : new Blob([new Uint8Array(found.bytes)]);
            },
        },
        new RepositoryPublisher(
            repositoryUrl,
            source.id,
            stores.contractSecrets.repository,
            stores.db,
            allowInsecureHttp,
        ),
    );
}
