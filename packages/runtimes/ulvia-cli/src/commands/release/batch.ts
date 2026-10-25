import {
    LocalArtifactFiles,
    LocalContractReleases,
    LocalRepositoryYanks,
} from "@bernouy/cms-repository/repository/filesystem";
import { planContractPublications } from "@bernouy/cms-repository/contracts/catalogue";
import { compareSemVer } from "@bernouy/cms-repository/contracts/compatibility";
import type { ResourceSource } from "./discovery";
import {
    prepareContractResource,
    prepareResource,
    resourceCoordinate,
    storeResource,
    validateConformance,
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
        bytes += Buffer.byteLength(resource.admission.canonicalJson);
        if (resource.kind === "contract") {
            bytes += (resource.admission.fixtureAssets ?? []).reduce((total, asset) => total + asset.bytes.size, 0);
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
    const ordered = await planContractPublications(
        catalogue,
        candidates.map(({ resource }) => resource.admission),
    );
    for (const admission of ordered) {
        await catalogue.publish(admission);
    }
    for (const { directory, resource } of candidates) {
        await validateConformance(directory, resource.admission, catalogue);
    }
    const byDigest = new Map(candidates.map(({ resource }) => [resource.admission.digest, resource]));
    const planned = new Set(ordered.map((admission) => admission.digest));
    const resources: PreparedResource[] = [
        ...ordered.map((admission) => byDigest.get(admission.digest)!),
        ...candidates.filter(({ resource }) => !planned.has(resource.admission.digest)).map(({ resource }) => resource),
    ];
    const remaining: PreparedResource[] = [];
    for (const source of sources.filter((source) => source.kind !== "contract")) {
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
    // Every source has been admitted before the first write. Storage failures can still leave a partial batch.
    for (const resource of [...resources, ...remaining]) {
        await storeResource(resource, root, log);
    }
    log(`Prepared ${coordinates.size} local releases.`);
}
