import { RepositoryRequestError } from "../core/errors";
import type { RepositoryCapabilityPorts } from "./interfaces";

export async function invokeRepositorySource(
    ports: RepositoryCapabilityPorts,
    id: string,
    input: Readonly<Record<string, unknown>>,
) {
    if (!ports.sources) {
        throw new RepositoryRequestError("NOT_FOUND");
    }
    const namespace = input.namespace as string;
    const collectionId = input.collectionId as string;
    const version = input.version as string;
    if (id === "source-get") {
        return ports.sources.get(namespace, collectionId, version);
    }
    const release = await ports.release({ kind: "collection", publisherId: namespace, id: collectionId, version });
    if (!release) {
        throw new RepositoryRequestError("NOT_FOUND");
    }
    await release.stream.cancel();
    if (release.digest !== input.releaseDigest) {
        throw new RepositoryRequestError("REJECTED");
    }
    await ports.sources.put(namespace, collectionId, version, {
        sourceJson: input.sourceJson as string,
        releaseDigest: input.releaseDigest as string,
    });
    return null;
}
