import { materializeSourceSnapshot } from "./materialize";
import { retainedSourceSnapshot } from "./retained";
import { collectionBuildInput } from "./input";
import { RepositoryRequestError } from "../../../core/errors";
import { join } from "node:path";
import { resourceName } from "@bernouy/ulvia-contracts/protocol";
import type { ReleaseCatalogue } from "repository/contracts/interfaces/ReleaseCatalogue";
import type { PublicationAsset } from "repository/repository/publication/types";
import { prepareCollectionRelease } from "repository/collections/tooling/authoring/source";
import { reservePreparationWorkspace, discardPreparationWorkspace } from "../workspace";

/** Compile only supplied bytes. Source references never authorize network or CMS file access. */
export async function compileCollectionSources(
    root: string,
    sourceJson: string,
    supplied: readonly PublicationAsset[],
    contracts?: ReleaseCatalogue,
) {
    const { snapshot, collectionId, assets } = collectionBuildInput(sourceJson, supplied);
    const work = await reservePreparationWorkspace(root);
    const directory = join(work, resourceName(collectionId));
    try {
        const byId = new Map(assets.map((asset) => [asset.id, asset.bytes]));
        await materializeSourceSnapshot(directory, snapshot, async (asset) => byId.get(asset.path.slice(7))!);
        const admission = await prepareCollectionRelease(directory, contracts);
        const { publisherId, version } = admission.release;
        const retained = retainedSourceSnapshot(snapshot, {
            kind: "collection",
            publisherId,
            id: collectionId,
            version,
            digest: admission.digest,
        });
        return { admission, sourceJson: retained };
    } catch (error) {
        if (
            ["EACCES", "EPERM", "EIO", "ENOSPC", "EROFS", "EMFILE", "ENFILE"].includes(
                (error as NodeJS.ErrnoException).code ?? "",
            )
        ) {
            throw error;
        }
        throw new RepositoryRequestError("REJECTED", "Collection sources could not be compiled");
    } finally {
        await discardPreparationWorkspace(root, work);
    }
}
