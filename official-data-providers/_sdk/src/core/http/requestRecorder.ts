import type { Recorder } from "src/interfaces/Recorder";
import { SdkError } from "src/core/errors";

/**
 * Per-request Recorder, stashed by the mount middleware and exposed to
 * domain handlers so they can emit `kind: request` operational logs
 * (base.md §10). Pinned on `globalThis` via `Symbol.for` for the same reason
 * as `requestAuth`: handlers read it across `serveApi`'s dynamic-import
 * boundary, where a plain module-level WeakMap could be a different instance.
 */
const STORE_KEY = Symbol.for("@bernouy/data-provider-sdk::requestRecorder");
const store = ((globalThis as Record<symbol, unknown>)[STORE_KEY] ??=
    new WeakMap<Request, Recorder>()) as WeakMap<Request, Recorder>;

export function setRequestRecorder(req: Request, rec: Recorder): void {
    store.set(req, rec);
}

export function requestRecorder(req: Request): Recorder {
    const r = store.get(req);
    if (!r) throw new SdkError("requestRecorder() outside the SDK middleware");
    return r;
}
