import { RemoteRepositoryClient, type RemoteCoordinate } from "@bernouy/cms-repository/repository/publication";
import { type RepositoryOwnerCredential } from "@bernouy/cms-repository/repository/namespaces";
import { formatCoordinate, type RemoteSelection } from "./arguments";
import { loadLocal } from "./storage";
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
    const coordinates: readonly RemoteCoordinate[] =
        selection.mode === "all"
            ? await allLocalCoordinates(root)
            : [
                  selection.kind
                      ? {
                            kind: selection.kind,
                            publisherId: selection.publisherId,
                            id: selection.id,
                            version: selection.version,
                        }
                      : await inferLocalCoordinate(root, selection),
              ];
    if (!coordinates.length) {
        throw new Error("No non-yanked local releases to push. Prepare resources with ulvia release first.");
    }
    const prepared: { coordinate: RemoteCoordinate; local: Awaited<ReturnType<typeof loadLocal>> }[] = [];
    for (const coordinate of coordinates) {
        prepared.push({ coordinate, local: await loadLocal(root, coordinate) });
    }
    const credentials = new Map<string, RepositoryOwnerCredential>();
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
