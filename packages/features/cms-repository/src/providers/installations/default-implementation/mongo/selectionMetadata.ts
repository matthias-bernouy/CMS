import type { Collection } from "mongodb";
import { installationSelectionDigest, installationSelectionRevisionFromDigests } from "../../core/selectionRevision";
import type { InstallationDocument } from "./record";

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

/** Reads small revision metadata and lazily upgrades pre-digest documents. */
export async function mongoInstallationSelectionRevision(
    collection: Collection<InstallationDocument>,
    siteId: string,
): Promise<string> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const records = await collection
            .find({ siteId }, { projection: { _id: 1, selectionDigest: 1 } })
            .sort({ _id: 1 })
            .toArray();
        let needsRetry = false;
        for (const record of records) {
            if (record.selectionDigest !== undefined) {
                if (!DIGEST_PATTERN.test(record.selectionDigest)) {
                    throw new Error("Stored provider installation has invalid selection digest");
                }
                continue;
            }
            const current = await collection.findOne({ _id: record._id, siteId });
            if (current) {
                const digest = await installationSelectionDigest(current.installation);
                await collection.updateOne(
                    { _id: record._id, siteId, revision: current.revision, selectionDigest: { $exists: false } },
                    { $set: { selectionDigest: digest } },
                );
            }
            needsRetry = true;
        }
        if (!needsRetry) {
            return installationSelectionRevisionFromDigests(
                siteId,
                records.map((record) => [record._id, record.selectionDigest!] as const),
            );
        }
    }
    throw new Error("Provider installation selection metadata changed during backfill");
}
