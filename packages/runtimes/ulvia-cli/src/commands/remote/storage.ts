import {
    admitContractBundleJson,
    admitContractReleaseJson,
    parseContractReleaseJson,
} from "@bernouy/cms-repository/contracts";
import { admitProviderManifestJson } from "@bernouy/cms-repository/providers";
import { admitCollectionReleaseJson } from "@bernouy/cms-repository/collections";
import {
    LocalArtifactFiles,
    LocalCollectionRepository,
    LocalContractReleases,
    LocalProviderReleases,
    LocalRepositoryYanks,
} from "@bernouy/cms-repository/repository/filesystem";
import {
    type PublicationAsset,
    type PublicationEnvelope,
    type RemoteCoordinate,
} from "@bernouy/cms-repository/repository/publication";

export async function loadLocal(root: string, coordinate: RemoteCoordinate) {
    const yanks = new LocalRepositoryYanks(root);
    if (await yanks.get(coordinate.kind, coordinate.publisherId, coordinate.id, coordinate.version)) {
        throw new Error("A locally yanked release cannot be pushed");
    }
    if (coordinate.kind === "collection") {
        const artifact = await new LocalCollectionRepository(root).get(
            coordinate.publisherId,
            coordinate.id,
            coordinate.version,
        );
        if (!artifact) {
            throw new Error("Local collection release not found");
        }
        return {
            digest: artifact.digest,
            envelope: {
                kind: coordinate.kind,
                canonicalJson: artifact.canonicalJson,
                assets: await collectionAssets(artifact.assets),
            } satisfies PublicationEnvelope,
        };
    }
    const files = new LocalArtifactFiles(root);
    const type = coordinate.kind === "contract" ? "contracts" : "providers";
    const bytes = await files.get(type, coordinate.publisherId, coordinate.id, coordinate.version);
    if (!bytes) {
        throw new Error(`Local ${coordinate.kind} release not found`);
    }
    const canonicalJson = bytes.toString("utf8");
    const contracts = new LocalContractReleases(files, yanks);
    if (coordinate.kind === "contract") {
        const assets = await contractAssets(files, canonicalJson);
        const admission = assets.length
            ? await admitContractBundleJson(canonicalJson, assets)
            : await admitContractReleaseJson(canonicalJson);
        const record = await (await contracts.catalogue()).get(coordinate.id, coordinate.version);
        assertDigest(admission.digest, record!.admission.digest);
        return {
            digest: admission.digest,
            envelope: {
                kind: coordinate.kind,
                canonicalJson,
                assets,
            } satisfies PublicationEnvelope,
        };
    }
    const record = await (await new LocalProviderReleases(files, contracts, yanks).catalogue()).get(
        coordinate.id,
        coordinate.version,
    );
    return {
        digest: record!.admission.digest,
        envelope: { kind: coordinate.kind, canonicalJson, assets: [] } satisfies PublicationEnvelope,
    };
}

export async function storeLocal(
    root: string,
    remote: PublicationEnvelope & { expectedDigest: string },
): Promise<boolean> {
    const files = new LocalArtifactFiles(root);
    const yanks = new LocalRepositoryYanks(root);
    const contracts = new LocalContractReleases(files, yanks);
    if (remote.kind === "collection") {
        const admission = await admitCollectionReleaseJson(remote.canonicalJson, remote.assets, {
            contracts: await contracts.catalogue(),
        });
        assertDigest(admission.digest, remote.expectedDigest);
        return new LocalCollectionRepository(root).store(admission);
    }
    if (remote.kind === "contract") {
        const admission = remote.assets.length
            ? await admitContractBundleJson(remote.canonicalJson, remote.assets)
            : await admitContractReleaseJson(remote.canonicalJson);
        assertDigest(admission.digest, remote.expectedDigest);
        return (await contracts.publish(remote.canonicalJson, remote.assets)).added;
    }
    const admission = await admitProviderManifestJson(remote.canonicalJson, await contracts.catalogue());
    assertDigest(admission.digest, remote.expectedDigest);
    return (await new LocalProviderReleases(files, contracts, yanks).release(remote.canonicalJson)).added;
}

async function collectionAssets(assets: readonly { id: string; bytes: Blob }[]): Promise<PublicationAsset[]> {
    return assets.map((asset) => ({ id: asset.id, bytes: asset.bytes }));
}

async function contractAssets(files: LocalArtifactFiles, canonicalJson: string): Promise<PublicationAsset[]> {
    return (parseContractReleaseJson(canonicalJson).fixtureAssets ?? []).map((asset) => ({
        id: asset.id,
        bytes: files.fixtureBlob(canonicalJson, asset.id),
    }));
}

function assertDigest(actual: string, expected: string): void {
    if (actual !== expected) {
        throw new Error(`Repository digest mismatch: expected ${expected}, received ${actual}`);
    }
}
