import { NamespaceAccessError } from "./namespaces";
import type { RepositoryNamespaceCredential } from "../publication/transport/credentials";
import type { AdmittedCollectionRelease } from "cms-repository/exports/collections/index";
import { RepositoryConnection } from "../publication/transport/connection";
import { RepositoryRequestError } from "../core/errors";
import { CollectionPreparationError } from "./preparations/errors";
import type { CollectionPublisher } from "./CollectionAuthoring";

export type PublicationPreflight = Readonly<{
    state: "complete" | "incomplete";
    repositoryId: string | null;
    origin: string;
}>;

export async function collectionPreflight(
    publisher: CollectionPublisher,
    artifact: AdmittedCollectionRelease,
): Promise<PublicationPreflight> {
    const status = await publisher.connectionStatus();
    const result = {
        state: "incomplete" as const,
        repositoryId: status.repositoryId,
        origin: new URL(publisher.repositoryUrl).origin,
    };
    if (!status.configured || Buffer.byteLength(artifact.canonicalJson) > 1024 * 1024) {
        return result;
    }
    let credential: RepositoryNamespaceCredential;
    try {
        credential = await publisher.credential(artifact.release.publisherId);
    } catch (error) {
        if (error instanceof RepositoryRequestError || error instanceof NamespaceAccessError) {
            throw error;
        }
        return result;
    }
    try {
        const connection = new RepositoryConnection(publisher.repositoryUrl, credential, publisher);
        const response = (await connection.json(
            "v1/publications/check-collection",
            "QUERY",
            {
                namespace: credential.namespace,
                namespaceRevision: credential.revision,
                canonicalJson: artifact.canonicalJson,
            },
            true,
            4096,
        )) as { complete?: unknown; digest?: unknown };
        if (response?.digest !== artifact.digest || typeof response.complete !== "boolean") {
            return result;
        }
        return { ...result, state: response.complete ? "complete" : "incomplete" };
    } catch (error) {
        if (error instanceof RepositoryRequestError && error.publicationCode) {
            throw new CollectionPreparationError(error.message, [
                {
                    code: `collection.publication.${error.publicationCode}`,
                    severity: "error",
                    message: error.message,
                    location: {
                        path: "definition.json",
                        attribute: "version",
                        ...(error.publicationResource?.kind === "bloc" ? { blocId: error.publicationResource.id } : {}),
                    },
                },
            ]);
        }
        return result;
    }
}
