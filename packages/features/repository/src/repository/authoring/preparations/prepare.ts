import { materializeSourceSnapshot } from "./source/materialize";
import { retainedSourceSnapshot } from "./source/retained";
import { isResourceId, resourceName } from "@bernouy/ulvia-contracts/protocol";
import { join } from "node:path";
import { writePreparation, sourceDigest } from "./record";
import type { PublicationPreflight } from "../preflight";
import type { AdmittedCollectionRelease } from "repository/collections/interfaces/CollectionAdmission";
import { prepareCollectionRelease } from "repository/collections/tooling/authoring/source";
import { parseSourceSnapshot, type SourceAsset } from "repository/repository/authoring/snapshot";
import type { ReleaseCatalogue } from "repository/exports/contracts/catalogue";
import {
    collectionBrowserRisk,
    collectionBrowserRiskDigest,
} from "repository/collections/core/validation/browserCapabilities";
import { randomUUID } from "node:crypto";
import {
    reservePreparationWorkspace,
    commitPreparationWorkspace,
    discardPreparationWorkspace,
} from "repository/repository/authoring/preparations/workspace";

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
    try {
        await materializeSourceSnapshot(directory, snapshot, (asset) => host.readAsset(asset));
        const artifact = await prepareCollectionRelease(directory, host.contracts);
        const preflight = await inspect(artifact);
        const digest = artifact.digest;
        const id = randomUUID();
        const retainedSources = retainedSourceSnapshot(snapshot, {
            kind: "collection",
            publisherId: artifact.release.publisherId,
            id: collectionId,
            version: artifact.release.version,
            digest,
        });
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
