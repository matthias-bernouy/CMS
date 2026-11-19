import { resolve } from "node:path";
import { FilesystemLeaseBusyError } from "../core/lock";
import { DEFAULT_COLLECTION_LIMITS } from "repository/collections/core/limits";
import type { PublicationEnvelope } from "../../publication/types";

const MAX_BUILDS = 16;
const MAX_PENDING_BYTES = DEFAULT_COLLECTION_LIMITS.maxBundleBytes + 2 * DEFAULT_COLLECTION_LIMITS.maxDocumentBytes;
const pending = new Map<string, { count: number; bytes: number }>();

/** Reserve bounded retained inputs before waiting for the cross-process compiler lease. */
export function reserveCollectionBuild(root: string, envelope: PublicationEnvelope): () => void {
    const key = resolve(root);
    const state = pending.get(key) ?? { count: 0, bytes: 0 };
    const retained = retainedBytes(envelope);
    if (!Number.isSafeInteger(retained) || retained < 0) {
        throw new TypeError("Invalid collection build size");
    }
    const bytes = state.count === 0 ? 0 : retained;
    if (state.count >= MAX_BUILDS || state.bytes + bytes > MAX_PENDING_BYTES) {
        throw new FilesystemLeaseBusyError();
    }
    state.count++;
    state.bytes += bytes;
    pending.set(key, state);
    let released = false;
    return () => {
        if (!released) {
            released = true;
            state.count--;
            state.bytes -= bytes;
            if (state.count === 0) {
                pending.delete(key);
            }
        }
    };
}

function retainedBytes(envelope: PublicationEnvelope): number {
    return (
        Buffer.byteLength(envelope.canonicalJson) +
        Buffer.byteLength(envelope.sourceJson ?? "") +
        envelope.assets.reduce(
            (sum, asset) => sum + (asset.bytes instanceof Blob ? asset.bytes.size : asset.bytes.byteLength),
            0,
        )
    );
}
