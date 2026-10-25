import { basename, join } from "node:path";
import type { AdmittedContractRelease } from "@bernouy/cms-repository/contracts";
import type { ReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";
import { admitProviderManifestJson, type AdmittedProviderManifest } from "@bernouy/cms-repository/providers";
import type { AdmittedCollectionRelease } from "@bernouy/cms-repository/collections";
import {
    LocalArtifactFiles,
    LocalCollectionRepository,
    LocalContractReleases,
    LocalProviderReleases,
    LocalRepositoryYanks,
} from "@bernouy/cms-repository/repository/filesystem";
import { compileConformanceSource, prepareConformanceSource } from "../../release/authored/conformance";
import { resolveConformanceDependencies } from "../../release/authored/conformanceDependencies";
import { prepareContractSource } from "../../release/authored/contract";
import { prepareCollectionRelease } from "@bernouy/cms-repository/collections/build";

export type PreparedResource =
    | Readonly<{ kind: "contract"; admission: AdmittedContractRelease }>
    | Readonly<{ kind: "provider-manifest"; admission: AdmittedProviderManifest }>
    | Readonly<{ kind: "collection"; admission: AdmittedCollectionRelease }>;

export async function prepareContractResource(directory: string): Promise<PreparedResource & { kind: "contract" }> {
    const { admission } = await prepareContractSource(directory);
    assertFolder(directory, admission.release.contractId);
    return { kind: "contract", admission };
}

export async function validateConformance(
    directory: string,
    release: AdmittedContractRelease,
    contracts: ReleaseCatalogue,
): Promise<void> {
    const source = await compileConformanceSource(directory);
    if (source) {
        const dependencies = await resolveConformanceDependencies(
            source,
            async (id, version) => (await contracts.get(id, version))?.admission ?? null,
        );
        await prepareConformanceSource(directory, release, dependencies, source);
    }
}

export async function prepareResource(directory: string, contracts: ReleaseCatalogue): Promise<PreparedResource> {
    const source = await Bun.file(join(directory, "definition.json")).text();
    const definition = JSON.parse(source) as { kind?: unknown };
    if (definition.kind === "contract") {
        const prepared = await prepareContractResource(directory);
        await validateConformance(directory, prepared.admission, contracts);
        return prepared;
    }
    if (definition.kind === "provider-manifest") {
        const admission = await admitProviderManifestJson(source, contracts);
        assertFolder(directory, admission.manifest.providerId);
        return { kind: "provider-manifest", admission };
    }
    if (definition.kind === "collection") {
        return { kind: "collection", admission: await prepareCollectionRelease(directory, contracts) };
    }
    throw new Error("definition.json must declare kind: collection, contract, or provider-manifest");
}

export async function storeResource(
    resource: PreparedResource,
    root: string,
    log: (message: string) => void,
): Promise<void> {
    const files = new LocalArtifactFiles(root);
    const yanks = new LocalRepositoryYanks(root);
    const contracts = new LocalContractReleases(files, yanks);
    let added: boolean;
    if (resource.kind === "contract") {
        added = (await contracts.publish(resource.admission.canonicalJson, resource.admission.fixtureAssets)).added;
    } else if (resource.kind === "provider-manifest") {
        added = (await new LocalProviderReleases(files, contracts, yanks).release(resource.admission.canonicalJson))
            .added;
    } else {
        added = await new LocalCollectionRepository(root).store(resource.admission);
    }
    log(`${added ? "+" : "="} ${resourceCoordinate(resource)} (${resource.admission.digest})`);
}

export function resourceCoordinate(resource: PreparedResource): string {
    if (resource.kind === "provider-manifest") {
        const { provenance, providerId, version } = resource.admission.manifest;
        return `provider ${provenance.publisherId}/${providerId}@${version}`;
    }
    if (resource.kind === "contract") {
        const { publisherId, contractId, version } = resource.admission.release;
        return `contract ${publisherId}/${contractId}@${version}`;
    }
    const { publisherId, collectionId, version } = resource.admission.release;
    return `collection ${publisherId}/${collectionId}@${version}`;
}

function assertFolder(directory: string, id: string): void {
    if (basename(directory) !== id) {
        throw new Error(`Resource folder ${basename(directory)} does not match definition ID ${id}`);
    }
}
