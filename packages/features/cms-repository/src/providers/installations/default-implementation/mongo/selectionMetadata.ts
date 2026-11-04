import { isSha256Digest } from "@bernouy/binary-media";
import type { Collection } from "mongodb";
import { installationSelectionRevisionFromDigests } from "../../core/selectionRevision";
import type { InstallationDocument } from "./record";

/** Read only the metadata written by the current installation format. */
export async function mongoInstallationSelectionRevision(
    collection: Collection<InstallationDocument>,
    siteId: string,
): Promise<string> {
    const records = await collection
        .find({ siteId }, { projection: { _id: 1, selectionDigest: 1 } })
        .sort({ _id: 1 })
        .toArray();
    for (const record of records) {
        if (!isSha256Digest(record.selectionDigest)) {
            throw new Error("Stored provider installation has invalid selection digest");
        }
    }
    return installationSelectionRevisionFromDigests(
        siteId,
        records.map((record) => [record._id, record.selectionDigest] as const),
    );
}
