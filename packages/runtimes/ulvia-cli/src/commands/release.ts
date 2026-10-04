import { basename, join, resolve } from "node:path";
import { LocalArtifactFiles } from "../repository/artifactFiles";
import { LocalContractReleases } from "../repository/contracts";
import { LocalCollectionRepository } from "../repository/local";
import { LocalProviderReleases } from "../repository/providers";
import { prepareCollectionRelease } from "../release/source";

export async function releaseCommand(
    args: readonly string[],
    cwd: string,
    repositoryRoot: string,
    log: (message: string) => void,
): Promise<void> {
    if (args.length !== 1 || args[0]!.startsWith("-")) {
        throw new Error("Usage: ulvia release <resource-directory>");
    }
    const directory = resolve(cwd, args[0]!);
    const bytes = await Bun.file(join(directory, "definition.json")).text();
    const definition = JSON.parse(bytes) as Record<string, unknown>;
    const kind = definition.kind;
    const files = new LocalArtifactFiles(repositoryRoot);
    const contracts = new LocalContractReleases(files);
    if (kind === "collection") {
        const artifact = await prepareCollectionRelease(directory, await contracts.catalogue());
        const added = await new LocalCollectionRepository(repositoryRoot).store(artifact);
        const { publisherId, collectionId, version } = artifact.release;
        log(`${added ? "+" : "="} collection ${publisherId}/${collectionId}@${version} (${artifact.digest})`);
        return;
    }
    if (kind === "contract") {
        assertFolder(directory, definition.contractId);
        const { added, admission } = await contracts.release(bytes, directory);
        const { publisherId, contractId, version } = admission.release;
        log(`${added ? "+" : "="} contract ${publisherId}/${contractId}@${version} (${admission.digest})`);
        return;
    }
    if (kind === "provider-manifest") {
        assertFolder(directory, definition.providerId);
        const { added, admission } = await new LocalProviderReleases(files, contracts).release(bytes);
        const { providerId, version, provenance } = admission.manifest;
        log(`${added ? "+" : "="} provider ${provenance.publisherId}/${providerId}@${version} (${admission.digest})`);
        return;
    }
    throw new Error("definition.json must declare kind: collection, contract, or provider-manifest");
}

function assertFolder(directory: string, id: unknown): void {
    if (typeof id !== "string" || basename(directory) !== id) {
        throw new Error(`Resource folder ${basename(directory)} does not match definition ID ${id}`);
    }
}
