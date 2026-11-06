import { isResourceId, resourceName } from "cms-repository/exports/contracts/protocol";
import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { writePreparation, sourceDigest } from "./record";
import type { PublicationPreflight } from "../preflight";
import type { AdmittedCollectionRelease } from "cms-repository/exports/collections/index";
import { prepareCollectionRelease } from "cms-repository/exports/collections/build";
import { parseSourceSnapshot, canonicalSourceSnapshot, type SourceAsset } from "../snapshot";
import type { ReleaseCatalogue } from "cms-repository/exports/contracts/catalogue";
import { collectionBrowserRisk, collectionBrowserRiskDigest } from "cms-repository/exports/collections/index";
import { randomUUID } from "node:crypto";
import { reservePreparationWorkspace, commitPreparationWorkspace, discardPreparationWorkspace } from "./workspace";

export interface AuthoringHost {
    readonly root: string;
    readonly contracts: ReleaseCatalogue;
    readonly readAsset: (asset: SourceAsset) => Promise<Blob>;
}

export async function prepareRemoteCollection(
    host: AuthoringHost,
    sourceJson: string,
    inspect: (artifact: AdmittedCollectionRelease) => Promise<PublicationPreflight>,
) {
    const snapshot = parseSourceSnapshot(sourceJson);
    const definition = JSON.parse(snapshot.files.find((file) => file.path === "definition.json")!.content);
    const collectionId = definition.collectionId;
    if (!isResourceId(collectionId)) {
        throw new Error("Invalid collection ID");
    }
    const work = await reservePreparationWorkspace(host.root);
    const directory = join(work, resourceName(collectionId));
    let bytes = Buffer.byteLength(sourceJson);
    try {
        for (const file of snapshot.files) {
            const path = join(directory, file.path);
            await mkdir(dirname(path), { recursive: true, mode: 0o700 });
            await writeFile(path, file.content, { flag: "wx", mode: 0o600 });
        }
        for (const asset of snapshot.assets) {
            const blob = await host.readAsset(asset);
            bytes += blob.size;
            if (blob.size > 16 * 1024 * 1024 || bytes > 64 * 1024 * 1024) {
                throw new Error("Collection source assets exceed the preparation limit");
            }
            const path = join(directory, asset.path);
            await mkdir(dirname(path), { recursive: true, mode: 0o700 });
            await writeFile(path, new Uint8Array(await blob.arrayBuffer()), { flag: "wx", mode: 0o600 });
        }
        const artifact = await prepareCollectionRelease(directory, host.contracts);
        const preflight = await inspect(artifact);
        const digest = artifact.digest;
        const id = randomUUID();
        const assets = snapshot.assets.map((asset) => ({
            path: asset.path,
            publisherId: artifact.release.publisherId,
            collectionId,
            version: artifact.release.version,
            releaseDigest: digest,
            assetId: asset.path.slice(7),
        }));
        const retainedSources = canonicalSourceSnapshot({ files: snapshot.files, assets });
        if (Buffer.byteLength(retainedSources) > 1024 * 1024) {
            throw new Error("Retained collection sources exceed 1 MiB");
        }
        await writePreparation(work, {
            schema: "ulvia.collection-preparation.v1",
            id,
            digest,
            sourceJson: retainedSources,
            sourceDigest: sourceDigest(retainedSources),
            directory: resourceName(collectionId),
            canonicalJson: artifact.canonicalJson,
            expiresAt: Date.now() + 7 * 86400_000,
            repositoryId: preflight.repositoryId,
            repositoryOrigin: preflight.origin,
        });
        await commitPreparationWorkspace(host.root, work, id);
        const browserRisk = collectionBrowserRisk(artifact.release);
        return {
            preparationId: id,
            publisherId: artifact.release.publisherId,
            collectionId,
            version: artifact.release.version,
            digest,
            sourceDigest: sourceDigest(retainedSources),
            preflight: preflight.state,
            approvedBrowserRiskDigest: collectionBrowserRiskDigest(browserRisk),
            browserRisk: browserRisk.level,
            diagnostics: [
                ...artifact.diagnostics.slice(0, preflight.state === "incomplete" ? 15 : 16),
                ...(preflight.state === "incomplete"
                    ? [
                          {
                              code: "collection.preflight_incomplete",
                              severity: "warning" as const,
                              message:
                                  "Publication history could not be checked completely. Publication will recheck current ownership and evolution; this preparation does not guarantee acceptance.",
                          },
                      ]
                    : []),
            ],
        };
    } catch (error) {
        await discardPreparationWorkspace(host.root, work);
        throw error;
    }
}
