import type { Surface, SurfaceExtensionMap } from "./types";

/**
 * Per-Editor registry of capabilities published by the bloc author. Stored as
 * `Map<surface, unknown[]>` — type-safe entry / exit via `SurfaceExtensionMap`.
 *
 * No dedup. Each Editor has its own registry, so cross-bloc collisions are
 * impossible. Re-`init()` cycles are handled upstream: `Editor.viewEditor()`
 * calls `clear()` before invoking `init()`, so the bloc author can call
 * `extend*` unconditionally without tracking disposers across cycles.
 *
 * `clear()` is also called from `Editor.viewClient()` and `Editor.dispose()`.
 */
export class ExtensionRegistry {

    private _byScope = new Map<Surface, unknown[]>();

    /** Registers an extension on a surface. Returns a disposer the caller may
     *  use for ad-hoc mid-session teardown — but is NOT required, since
     *  `clear()` runs on every mode swap. */
    add<S extends Surface>(surface: S, ext: SurfaceExtensionMap[S]): () => void {
        let list = this._byScope.get(surface);
        if (!list) { list = []; this._byScope.set(surface, list); }
        list.push(ext);
        return () => {
            const i = list!.indexOf(ext);
            if (i >= 0) list!.splice(i, 1);
        };
    }

    /** Returns extensions registered for `surface` on this Editor (insertion order). */
    list<S extends Surface>(surface: S): SurfaceExtensionMap[S][] {
        const list = this._byScope.get(surface);
        return list ? (list.slice() as SurfaceExtensionMap[S][]) : [];
    }

    /** Clears every extension on every surface. Idempotent. */
    clear(): void {
        this._byScope.clear();
    }
}
