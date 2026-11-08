import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
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
import { parseSourceSnapshot, canonicalSourceSnapshot } from "../snapshot";
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
        1024 * 1024,
        16,
    ) as Record<string, unknown>;
    const id = kind === "contract" ? definition.contractId : definition.providerId;
    if (definition.kind !== kind || !isResourceId(id)) {
        throw new Error("Invalid artifact kind or identifier");
    }
    const work = await reservePreparationWorkspace(host.root);
    const directory = join(work, resourceName(id));
    let bytes = Buffer.byteLength(sourceJson);
    try {
        for (const file of snapshot.files) {
            const target = join(directory, file.path);
            await mkdir(dirname(target), { recursive: true, mode: 0o700 });
            await writeFile(target, file.content, { flag: "wx", mode: 0o600 });
        }
        for (const asset of snapshot.assets) {
            const blob = await host.readAsset(asset);
            bytes += blob.size;
            if (blob.size > 16 * 1024 * 1024 || bytes > 64 * 1024 * 1024) {
                throw new Error("Source assets exceed the preparation limit");
            }
            const target = join(directory, asset.path);
            await mkdir(dirname(target), { recursive: true, mode: 0o700 });
            await writeFile(target, new Uint8Array(await blob.arrayBuffer()), { flag: "wx", mode: 0o600 });
        }
        const artifact = await compileArtifact(host, publisher, kind, directory);
        const status = await publisher.connectionStatus();
        const retained = canonicalSourceSnapshot({
            files: snapshot.files,
            assets: snapshot.assets.map((asset) => ({
                path: asset.path,
                publisherId: artifact.publisherId,
                contractId: artifact.id,
                version: artifact.version,
                releaseDigest: artifact.digest,
                assetId: asset.path.slice(9),
            })),
        });
        if (Buffer.byteLength(retained) > 1024 * 1024) {
            throw new Error("Retained sources exceed 1 MiB");
        }
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
