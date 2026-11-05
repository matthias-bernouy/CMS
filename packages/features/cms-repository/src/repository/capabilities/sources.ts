import { RepositoryRequestError } from "../core/errors";
import type { RepositoryCapabilityPorts } from "./interfaces";
import { isResourceId, resourcePublisher } from "cms-repository/exports/contracts/protocol";

export async function invokeRepositorySource(
    ports: RepositoryCapabilityPorts,
    id: string,
    input: Readonly<Record<string, unknown>>,
) {
    if (!ports.sources) {
        throw new RepositoryRequestError("NOT_FOUND");
    }
    const namespace = input.namespace as string;
    const artifact = id.startsWith("artifact-");
    const kind = artifact ? input.kind : "collection";
    const collectionId = (artifact ? input.id : input.collectionId) as string;
    const version = input.version as string;
    if (
        (artifact && kind !== "contract" && kind !== "provider-manifest") ||
        !isResourceId(collectionId) ||
        resourcePublisher(collectionId) !== namespace ||
        !["collection", "contract", "provider-manifest"].includes(kind as string)
    ) {
        throw new RepositoryRequestError("REJECTED", "Invalid source coordinate");
    }
    if (kind !== "collection") {
        if (kind !== "contract" && kind !== "provider-manifest") {
            throw new RepositoryRequestError("REJECTED");
        }
        if (id === "artifact-source-get") {
            return ports.sources.getArtifact(kind, namespace, collectionId, version);
        }
    } else if (id === "source-get") {
        return ports.sources.get(namespace, collectionId, version);
    }
    const release = await ports.release({
        kind: kind as "collection" | "contract" | "provider-manifest",
        publisherId: namespace,
        id: collectionId,
        version,
    });
    if (!release) {
        throw new RepositoryRequestError("NOT_FOUND");
    }
    await release.stream.cancel();
    if (release.digest !== input.releaseDigest) {
        throw new RepositoryRequestError("REJECTED");
    }
    const snapshot = {
        sourceJson: input.sourceJson as string,
        releaseDigest: input.releaseDigest as string,
    };
    if (kind === "contract" || kind === "provider-manifest") {
        await ports.sources.putArtifact(kind, namespace, collectionId, version, snapshot);
    } else {
        await ports.sources.put(namespace, collectionId, version, snapshot);
    }
    return null;
}
