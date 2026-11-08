import {
    LocalArtifactFiles,
    LocalContractReleases,
    LocalProviderReleases,
    LocalRepositoryYanks,
} from "@bernouy/repository/repository/filesystem";
import { planContractPublications } from "@bernouy/repository/contracts/catalogue";
import { prepareReleaseModule } from "./module";
import { admitContractBundleJson } from "@bernouy/ulvia-contracts";
import { admitProviderManifestJson } from "@bernouy/ulvia-providers";
import { admitCollectionRelease } from "@bernouy/repository/collections";
import { compareSemVer } from "@bernouy/ulvia-contracts/compatibility";
import type { ResourceSource } from "./discovery";
import {
    prepareContractResource,
    prepareResource,
    resourceCoordinate,
    storeResource,
    type PreparedResource,
} from "./resource";

const MAX_PREPARED_BYTES = 512 * 1024 * 1024;

export async function releaseBatch(
    sources: readonly ResourceSource[],
    root: string,
    log: (message: string) => void,
): Promise<void> {
    const contracts = new LocalContractReleases(new LocalArtifactFiles(root), new LocalRepositoryYanks(root));
    const catalogue = await contracts.catalogue();
    const candidates: { directory: string; resource: Awaited<ReturnType<typeof prepareContractResource>> }[] = [];
    let bytes = 0;
    const coordinates = new Set<string>();
    function include(resource: PreparedResource): void {
        const coordinate = resourceCoordinate(resource);
        if (coordinates.has(coordinate)) {
            throw new Error(`Duplicate authored release coordinate: ${coordinate}`);
        }
        coordinates.add(coordinate);
        if (coordinates.size > 256) {
            throw new Error("Release batch exceeds its 256-resource limit");
        }
        bytes += Buffer.byteLength(resource.admission.canonicalJson);
        if (resource.kind === "contract") {
            bytes += [
                ...(resource.admission.fixtureAssets ?? []),
                ...(resource.admission.documentationAssets ?? []),
            ].reduce((total, asset) => total + asset.bytes.size, 0);
        } else if (resource.kind === "collection") {
            bytes += resource.admission.assets.reduce((total, asset) => total + asset.bytes.size, 0);
        }
        if (bytes > MAX_PREPARED_BYTES) {
            throw new Error("Recursive release exceeds its 512 MiB prepared-byte limit");
        }
    }
    for (const source of sources.filter((source) => source.kind === "contract")) {
        const resource = await prepareContractResource(source.directory);
        include(resource);
        candidates.push({ directory: source.directory, resource });
    }
    const modules: PreparedResource[] = [];
    for (const source of sources.filter((source) => source.kind === "sdk")) {
        for (const resource of await prepareReleaseModule(source.directory)) {
            include(resource);
            if (resource.kind === "contract") {
                const admission = await admitContractBundleJson(resource.admission.canonicalJson, [
                    ...(resource.admission.documentationAssets ?? []),
                    ...(resource.admission.fixtureAssets ?? []),
                ]);
                candidates.push({ directory: source.directory, resource: { kind: "contract", admission } });
            } else {
                modules.push(resource);
            }
        }
    }
    const ordered = await planContractPublications(
        catalogue,
        candidates.map(({ resource }) => resource.admission),
    );
    for (const admission of ordered) {
        await catalogue.publish(admission);
    }
    const byDigest = new Map(candidates.map(({ resource }) => [resource.admission.digest, resource]));
    const planned = new Set(ordered.map((admission) => admission.digest));
    const resources: PreparedResource[] = [
        ...ordered.map((admission) => byDigest.get(admission.digest)!),
        ...candidates.filter(({ resource }) => !planned.has(resource.admission.digest)).map(({ resource }) => resource),
    ];
    const remaining: PreparedResource[] = [];
    for (const resource of modules) {
        if (resource.kind === "provider-manifest") {
            remaining.push({
                kind: "provider-manifest",
                admission: await admitProviderManifestJson(resource.admission.canonicalJson, catalogue),
            });
        } else if (resource.kind === "collection") {
            remaining.push({
                kind: "collection",
                admission: await admitCollectionRelease(resource.admission.release, resource.admission.assets, {
                    contracts: catalogue,
                }),
            });
        }
    }
    for (const source of sources.filter((source) => source.kind !== "contract" && source.kind !== "sdk")) {
        const resource = await prepareResource(source.directory, catalogue);
        include(resource);
        remaining.push(resource);
    }
    remaining.sort((left, right) => {
        if (left.kind !== right.kind) {
            return left.kind === "provider-manifest" ? -1 : 1;
        }
        const a = resourceCoordinate(left);
        const b = resourceCoordinate(right);
        const prefixA = a.slice(0, a.lastIndexOf("@"));
        const prefixB = b.slice(0, b.lastIndexOf("@"));
        return prefixA === prefixB
            ? compareSemVer(a.slice(a.lastIndexOf("@") + 1), b.slice(b.lastIndexOf("@") + 1))
            : prefixA < prefixB
              ? -1
              : 1;
    });
    const previousManifests = await new LocalProviderReleases(
        new LocalArtifactFiles(root),
        contracts,
        new LocalRepositoryYanks(root),
    ).catalogue();
    const manifests = new InMemoryProviderManifestCatalogue(catalogue);
    for (const previous of await previousManifests.list()) {
        await manifests.restore(previous.admission.canonicalJson, previous.admission.digest, previous.publishedAt);
    }
    for (const resource of remaining) {
        if (resource.kind === "provider-manifest") {
            await manifests.publish(resource.admission);
        }
    }
    // Every source has been admitted before the first write. Storage failures can still leave a partial batch.
    for (const resource of [...resources, ...remaining]) {
        await storeResource(resource, root, log);
    }
    log(`Prepared ${coordinates.size} local releases.`);
}

import { InMemoryProviderManifestCatalogue } from "@bernouy/repository/providers";
