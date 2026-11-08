import { verifyStoredCollectionArtifact } from "@bernouy/repository/collections";
import { join } from "node:path";
import { RemoteRepositoryClient } from "@bernouy/repository/repository/publication";
import { RepositoryAuthoring } from "@bernouy/repository/repository/authoring";
import type { HttpCollectionRepository } from "@bernouy/repository/collections/http";
import type { ProviderStores } from "../providerStores";
import type { CmsFileWorkspace } from "../CmsFileWorkspace";
import { RepositoryPublisher } from "./RepositoryPublisher";

export function createRepositoryAuthoring(
    stores: ProviderStores,
    filesDirectory: string,
    repositoryUrl: string,
    source: HttpCollectionRepository,
    fileWorkspace: CmsFileWorkspace,
    allowInsecureHttp = false,
) {
    return new RepositoryAuthoring(
        {
            root: join(filesDirectory, "collection-preparations"),
            contracts: stores.releases,
            readAsset: async (asset) => {
                if (asset.fileId && asset.generation) {
                    return fileWorkspace.readAsset(asset.fileId, asset.generation);
                }
                if (asset.contractId) {
                    const bytes = await new RemoteRepositoryClient(repositoryUrl, undefined, {
                        allowInsecureHttp,
                    }).pullContractAsset(
                        {
                            kind: "contract",
                            publisherId: asset.publisherId!,
                            id: asset.contractId,
                            version: asset.version!,
                        },
                        asset.releaseDigest!,
                        asset.assetId!,
                    );
                    return bytes instanceof Blob ? bytes : new Blob([new Uint8Array(bytes)]);
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
        new RepositoryPublisher(repositoryUrl, source.id, stores.contractSecrets.repository, allowInsecureHttp),
    );
}
