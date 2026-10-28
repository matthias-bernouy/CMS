import {
    LocalArtifactFiles,
    LocalCollectionRepository,
    LocalContractReleases,
    LocalProviderReleases,
    LocalRepositoryYanks,
} from "@bernouy/cms-repository/repository/filesystem";
import type { RemoteCoordinate } from "@bernouy/cms-repository/repository/publication";
import { orderCollections, orderContracts } from "./ordering";

export async function allLocalCoordinates(root: string): Promise<readonly RemoteCoordinate[]> {
    const files = new LocalArtifactFiles(root);
    const yanks = new LocalRepositoryYanks(root);
    const contracts = new LocalContractReleases(files, yanks);
    const coordinates: RemoteCoordinate[] = [];
    for (const record of await orderContracts(await (await contracts.catalogue()).list())) {
        if (!record.yank) {
            const { publisherId, contractId: id, version } = record.admission.release;
            coordinates.push({ kind: "contract", publisherId, id, version });
        }
    }
    for (const record of await (await new LocalProviderReleases(files, contracts, yanks).catalogue()).list()) {
        if (!record.yank) {
            const { provenance, providerId: id, version } = record.admission.manifest;
            coordinates.push({
                kind: "provider-manifest",
                publisherId: provenance.publisherId,
                id,
                version,
            });
        }
    }
    for (const { release } of orderCollections(await new LocalCollectionRepository(root).listMetadata())) {
        const coordinate: RemoteCoordinate = {
            kind: "collection",
            publisherId: release.publisherId,
            id: release.collectionId,
            version: release.version,
        };
        if (!(await yanks.get(coordinate.kind, coordinate.publisherId, coordinate.id, coordinate.version))) {
            coordinates.push(coordinate);
        }
    }
    return coordinates;
}
