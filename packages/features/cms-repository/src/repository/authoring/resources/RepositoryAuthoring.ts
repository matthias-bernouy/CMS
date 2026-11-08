import type {
    ContractPublication,
    ProviderManifestPublication,
    ArtifactPublication,
} from "cms-repository/application/authoring/interfaces/AuthoringDtos";
import {
    CollectionAuthoring,
    CollectionPreparationError,
} from "cms-repository/repository/authoring/CollectionAuthoring";
import { NamespaceAccessError } from "../namespaces";
import { RepositoryRequestError } from "../../core/errors";
import { RepositorySourceClient } from "../../sources/client";
import { publishPreparedArtifact } from "../publication/artifact";
import { prepareRemoteArtifact } from "./prepare";
import { AuthoringDependencyError } from "./dependencies/transport";
import type { AuthoredArtifactKind } from "./compiler";

/** Shares collection credentials and isolation with contract and manifest authoring. */
export class RepositoryAuthoring extends CollectionAuthoring {
    async prepareArtifact(kind: AuthoredArtifactKind, sourceJson: string) {
        try {
            return await prepareRemoteArtifact(this.host, this.publisher, kind, sourceJson);
        } catch (error) {
            if (
                error instanceof CollectionPreparationError ||
                error instanceof NamespaceAccessError ||
                error instanceof RepositoryRequestError ||
                error instanceof AuthoringDependencyError ||
                ["EACCES", "EPERM", "EIO", "ENOSPC", "EROFS", "EMFILE", "ENFILE"].includes(
                    (error as NodeJS.ErrnoException).code ?? "",
                )
            ) {
                throw error;
            }
            const message = (error instanceof Error ? error.message : "Invalid artifact sources")
                .replaceAll(this.host.root, "<sources>")
                .slice(0, 2048);
            throw new CollectionPreparationError(message, [{ code: `${kind}.invalid`, severity: "error", message }]);
        }
    }
    publishArtifact(kind: "contract", id: string, expectedDigest: string): Promise<ContractPublication>;
    publishArtifact(
        kind: "provider-manifest",
        id: string,
        expectedDigest: string,
    ): Promise<ProviderManifestPublication>;
    publishArtifact(kind: AuthoredArtifactKind, id: string, expectedDigest: string): Promise<ArtifactPublication>;
    publishArtifact(kind: AuthoredArtifactKind, id: string, expectedDigest: string): Promise<ArtifactPublication> {
        return publishPreparedArtifact(this.host, this.publisher, kind, id, expectedDigest);
    }
    async artifactSources(kind: AuthoredArtifactKind, namespace: string, id: string, version: string) {
        return new RepositorySourceClient(
            this.publisher.repositoryUrl,
            await this.publisher.credential(namespace),
            this.publisher,
        ).getArtifact(kind, id, version);
    }
}
