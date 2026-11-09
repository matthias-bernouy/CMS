import { AUTHORING_SOURCE_LIMITS } from "../authoring/preparations/source/limits";
import { RepositoryRequestError } from "../core/errors";
import type { RepositorySourceSnapshot } from "./interfaces";

export const SOURCE_SNAPSHOT_RECORD_BYTES = 2 * AUTHORING_SOURCE_LIMITS.snapshotBytes + 64 * 1024;
const LEGACY_SOURCE_UNITS = 1024 * 1024;

/** Retained APIs keep their original output promise; large snapshots require source-read. */
export async function legacySourceSnapshot(pending: Promise<RepositorySourceSnapshot | null>) {
    const snapshot = await pending;
    if (snapshot && snapshot.sourceJson.length > LEGACY_SOURCE_UNITS) {
        throw new RepositoryRequestError("REJECTED", "This snapshot requires the source-read API");
    }
    return snapshot;
}
