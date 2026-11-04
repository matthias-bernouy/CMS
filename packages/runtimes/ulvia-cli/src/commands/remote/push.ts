import { RemoteRepositoryClient, type RemoteCoordinate } from "@bernouy/cms-repository/repository/publication";
import { type RepositoryNamespaceCredential } from "@bernouy/cms-repository/repository/namespaces";
import { formatCoordinate, type RemoteSelection } from "./arguments";
import { loadLocal, type LocalPushReads } from "./storage";
import {
    LocalArtifactFiles,
    LocalCollectionRepository,
    LocalContractReleases,
    LocalRepositoryYanks,
} from "@bernouy/cms-repository/repository/filesystem";
import type { ReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";
import { inferLocalCoordinate } from "./selection";
import { allLocalCoordinates } from "./plan";
import { remoteRepositoryCredential } from "../namespace/credentials";

export async function pushCommand(
    selection: RemoteSelection,
    url: string,
    root: string,
    environment: Record<string, string | undefined>,
    log: (message: string) => void,
): Promise<void> {
    const contracts = new LocalContractReleases(new LocalArtifactFiles(root), new LocalRepositoryYanks(root));
    let catalogue: Promise<ReleaseCatalogue> | undefined;
    // Immutable preflight evidence is scoped to this command, never cached invocation authority.
    const reads: LocalPushReads = {
        collections: new LocalCollectionRepository(root),
        contractCatalogue: () => (catalogue ??= contracts.catalogue()),
    };
    const coordinates: readonly RemoteCoordinate[] =
        selection.mode === "all"
            ? await allLocalCoordinates(root, reads.collections)
            : [
                  selection.kind
                      ? {
                            kind: selection.kind,
                            publisherId: selection.publisherId,
                            id: selection.id,
                            version: selection.version,
                        }
                      : await inferLocalCoordinate(root, selection, reads.collections),
              ];
    if (!coordinates.length) {
        throw new Error("No non-yanked local releases to push. Prepare resources with ulvia release first.");
    }
    const prepared: { coordinate: RemoteCoordinate; local: Awaited<ReturnType<typeof loadLocal>> }[] = [];
    for (const coordinate of coordinates) {
        prepared.push({ coordinate, local: await loadLocal(root, coordinate, reads) });
    }
    const credentials = new Map<string, RepositoryNamespaceCredential>();
    for (const namespace of new Set(coordinates.map((coordinate) => coordinate.publisherId))) {
        credentials.set(namespace, await remoteRepositoryCredential(url, namespace, environment));
    }
    if (selection.mode === "all") {
        log(`Publishing ${prepared.length} local releases to ${url}.`);
    }
    let completed = 0;
    for (const { coordinate, local } of prepared) {
        try {
            const result = await new RemoteRepositoryClient(url, credentials.get(coordinate.publisherId)).push(
                local.envelope,
            );
            if (result.digest !== local.digest) {
                throw new Error("Remote repository returned a different publication digest");
            }
            completed++;
            log(`${result.added ? "+" : "="} ${formatCoordinate(coordinate)} (${result.digest})`);
        } catch (error) {
            throw new Error(
                `Push stopped at ${formatCoordinate(coordinate)} (${completed}/${prepared.length} completed): ${error instanceof Error ? error.message : "Publication failed"}`,
                { cause: error },
            );
        }
    }
    if (selection.mode === "all") {
        log(`Published ${completed} local releases.`);
    }
}
