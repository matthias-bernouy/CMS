import { materializeSourceSnapshot } from "../preparations/source/materialize";
import { retainedSourceSnapshot } from "../preparations/source/retained";
import { AUTHORING_SOURCE_LIMITS, CONTRACT_SOURCE_ASSET_LIMITS } from "../preparations/source/limits";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { isResourceId, resourceName, parseStrictJson } from "@bernouy/ulvia-contracts/protocol";
import type { CollectionPublisher } from "../CollectionAuthoring";
import type { AuthoringHost } from "../preparations/prepare";
import {
    reservePreparationWorkspace,
    commitPreparationWorkspace,
    discardPreparationWorkspace,
} from "../preparations/workspace";
import { sourceDigest, writeRecord } from "../preparations/record";
import { parseSourceSnapshot } from "../snapshot";
import { compileArtifact } from "./compiler";
import type { AuthoredArtifactKind } from "./compiler";
import type { ArtifactPreparation } from "./record";

export async function prepareRemoteArtifact(
    host: AuthoringHost,
    publisher: CollectionPublisher,
    kind: AuthoredArtifactKind,
    sourceJson: string,
) {
    const snapshot = parseSourceSnapshot(sourceJson, kind);
    const definition = parseStrictJson(
        snapshot.files.find((file) => file.path === "definition.json")!.content,
        AUTHORING_SOURCE_LIMITS.snapshotBytes,
        AUTHORING_SOURCE_LIMITS.jsonDepth,
    ) as Record<string, unknown>;
    const id = kind === "contract" ? definition.contractId : definition.providerId;
    if (definition.kind !== kind || !isResourceId(id)) {
        throw new Error("Invalid artifact kind or identifier");
    }
    const work = await reservePreparationWorkspace(host.root);
    const directory = join(work, resourceName(id));
    try {
        await materializeSourceSnapshot(
            directory,
            snapshot,
            (asset) => host.readAsset(asset),
            kind === "contract" ? CONTRACT_SOURCE_ASSET_LIMITS : undefined,
        );
        const artifact = await compileArtifact(host, publisher, kind, directory);
        const status = await publisher.connectionStatus();
        const retained = retainedSourceSnapshot(snapshot, {
            kind,
            publisherId: artifact.publisherId,
            id: artifact.id,
            version: artifact.version,
            digest: artifact.digest,
        });
        const preparationId = randomUUID();
        const prepared: ArtifactPreparation = {
            schema: "ulvia.artifact-preparation.v1",
            preparationId,
            kind,
            id: artifact.id,
            version: artifact.version,
            publisherId: artifact.publisherId,
            digest: artifact.digest,
            canonicalJson: artifact.canonicalJson,
            sourceJson: retained,
            sourceDigest: sourceDigest(retained),
            expiresAt: Date.now() + 7 * 86400_000,
            repositoryOrigin: new URL(publisher.repositoryUrl).origin,
            repositoryId: status.repositoryId,
        };
        await writeRecord(work, "prepared.json", prepared);
        await commitPreparationWorkspace(host.root, work, preparationId);
        return {
            preparationId,
            publisherId: artifact.publisherId,
            version: artifact.version,
            digest: artifact.digest,
            sourceDigest: prepared.sourceDigest,
            ...(kind === "contract" ? { contractId: artifact.id } : { providerId: artifact.id }),
            repositoryId: publisher.repositorySourceId,
            diagnostics: [],
        };
    } catch (error) {
        await discardPreparationWorkspace(host.root, work);
        throw error;
    }
}
