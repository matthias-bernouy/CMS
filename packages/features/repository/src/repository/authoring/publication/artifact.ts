import type { ArtifactPublication } from "repository/application/authoring/interfaces/AuthoringDtos";
import { join } from "node:path";
import { resourceName } from "@bernouy/ulvia-contracts/protocol";
import { RepositoryRequestError } from "../../core/errors";
import { RemoteRepositoryClient } from "../../publication/client";
import { RepositorySourceClient } from "../../sources/client";
import type { CollectionPublisher } from "../CollectionAuthoring";
import type { AuthoringHost } from "../preparations/prepare";
import { writeRecord } from "../preparations/record";
import { CollectionPublicationRecoveryError } from "../preparations/errors";
import { compileArtifact } from "../resources/compiler";
import type { AuthoredArtifactKind } from "../resources/compiler";
import { AuthoringDependencyError } from "../resources/dependencies/transport";
import { readArtifactPreparation, verifyArtifactSources } from "../resources/record";
import { readReceipt } from "./receipt";
import type { PublicationReceipt } from "./receipt";

export async function publishPreparedArtifact(
    host: AuthoringHost,
    publisher: CollectionPublisher,
    kind: AuthoredArtifactKind,
    id: string,
    expectedDigest: string,
): Promise<ArtifactPublication> {
    const { path, prepared } = await readArtifactPreparation(host.root, kind, id, expectedDigest);
    const credential = await publisher.credential(prepared.publisherId);
    if (
        prepared.repositoryOrigin !== credential.origin ||
        (prepared.repositoryId !== null && prepared.repositoryId !== credential.repositoryId)
    ) {
        throw new RepositoryRequestError("REJECTED", "Preparation belongs to another Repository. Prepare again.");
    }
    let receipt = await readReceipt(path, expectedDigest, credential, kind);
    let added = false;
    if (!receipt) {
        let artifact;
        try {
            await verifyArtifactSources(path, prepared);
            artifact = await compileArtifact(host, publisher, kind, join(path, resourceName(prepared.id)));
        } catch (error) {
            if (
                error instanceof AuthoringDependencyError ||
                ["EACCES", "EPERM", "EIO", "EMFILE", "ENFILE"].includes((error as NodeJS.ErrnoException).code ?? "")
            ) {
                throw error;
            }
            throw new RepositoryRequestError(
                "REJECTED",
                "Prepared artifact sources changed or are no longer valid. Prepare again.",
            );
        }
        if (artifact.digest !== expectedDigest || artifact.canonicalJson !== prepared.canonicalJson) {
            throw new RepositoryRequestError("REJECTED", "Prepared artifact changed. Prepare again.");
        }
        try {
            const published = await new RemoteRepositoryClient(publisher.repositoryUrl, credential, publisher).push(
                artifact,
            );
            if (published.digest !== expectedDigest) {
                throw new Error("Publication digest mismatch");
            }
            added = published.added;
            receipt = {
                schema: "ulvia.artifact-publication.v1",
                kind,
                digest: expectedDigest,
                origin: credential.origin,
                repositoryId: credential.repositoryId,
                namespace: credential.namespace,
                added,
                sourcesStored: false,
            } satisfies PublicationReceipt;
        } catch (error) {
            if (error instanceof RepositoryRequestError) {
                throw error;
            }
            throw new CollectionPublicationRecoveryError(id, expectedDigest, "unknown", { cause: error }, kind);
        }
    }
    try {
        await writeRecord(path, "publication.json", receipt);
        await new RepositorySourceClient(publisher.repositoryUrl, credential, publisher).putArtifact(
            kind,
            prepared.id,
            prepared.version,
            { sourceJson: prepared.sourceJson, releaseDigest: expectedDigest },
        );
        await writeRecord(path, "publication.json", { ...receipt, sourcesStored: true });
    } catch (error) {
        throw new CollectionPublicationRecoveryError(id, expectedDigest, "sources-pending", { cause: error }, kind);
    }
    const common = {
        added,
        digest: expectedDigest,
        repositoryId: publisher.repositorySourceId,
        publisherId: prepared.publisherId,
        version: prepared.version,
    };
    return kind === "contract"
        ? { ...common, kind, contractId: prepared.id }
        : { ...common, kind, providerId: prepared.id };
}
