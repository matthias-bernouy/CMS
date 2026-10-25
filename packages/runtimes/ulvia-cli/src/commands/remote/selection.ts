import { LocalArtifactFiles, LocalCollectionRepository } from "@bernouy/cms-repository/repository/filesystem";
import type { RemoteCoordinate } from "@bernouy/cms-repository/repository/publication";

export async function inferLocalCoordinate(
    root: string,
    coordinate: Omit<RemoteCoordinate, "kind">,
): Promise<RemoteCoordinate> {
    const files = new LocalArtifactFiles(root);
    const { publisherId, id, version } = coordinate;
    const [contract, provider, collection] = await Promise.all([
        files.get("contracts", publisherId, id, version),
        files.get("providers", publisherId, id, version),
        new LocalCollectionRepository(root).getMetadata(publisherId, id, version),
    ]);
    const candidates: RemoteCoordinate[] = [];
    if (contract) {
        candidates.push({ publisherId, id, version, kind: "contract" });
    }
    if (provider) {
        candidates.push({ publisherId, id, version, kind: "provider-manifest" });
    }
    if (collection) {
        candidates.push({ publisherId, id, version, kind: "collection" });
    }
    if (candidates.length !== 1) {
        throw new Error(
            candidates.length
                ? "Ambiguous local release: add collection, contract or provider before the coordinate."
                : "Local release not found. Prepare it with ulvia release before pushing.",
        );
    }
    return candidates[0]!;
}
