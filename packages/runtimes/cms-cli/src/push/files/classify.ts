import type { LocalFile } from "./scan";
import type { PageStatus } from "../shared/recap";
import { detectConflict, type PushState } from "../shared/state";

/** Minimal shape of a remote file we rely on for classification. */
export type RemoteFile = { id: string; size: number };

export type ClassifiedFile = {
    file: LocalFile;
    /** Remote item id when the path already exists, else null. */
    remoteId: string | null;
    status: PageStatus;
};

/**
 * Classify each local file against the remote tree + local sync state.
 *
 * The server stores no content hash for a file — only `size` — so `size` is
 * the only fingerprint available for remote-drift detection. A same-size
 * replacement made via the admin UI therefore slips past the conflict check;
 * `--force` overwrites regardless. Local change detection is exact (sha256).
 */
export function classifyFiles(
    local: LocalFile[],
    remoteByPath: Map<string, RemoteFile>,
    state: PushState,
    forceAll: boolean,
): ClassifiedFile[] {
    const out: ClassifiedFile[] = [];

    for (const file of local) {
        const remote = remoteByPath.get(file.path) ?? null;

        if (!remote) {
            out.push({ file, remoteId: null, status: "new" });
            continue;
        }

        const key = `file:${file.path}` as const;
        if (!forceAll && detectConflict(state, key, String(remote.size))) {
            out.push({ file, remoteId: remote.id, status: "conflict" });
            continue;
        }

        const known = state.entities[key];
        const status: PageStatus = known && known.hash === file.hash ? "unchanged" : "update";
        out.push({ file, remoteId: remote.id, status });
    }
    return out;
}
